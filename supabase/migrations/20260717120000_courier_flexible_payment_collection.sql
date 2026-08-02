-- Update courier_update_delivery to dynamically support payment collection for any unpaid/partially paid order.
CREATE OR REPLACE FUNCTION public.courier_update_delivery(
  p_order_id uuid,
  p_status text,
  p_notes text DEFAULT NULL,
  p_cod_collected boolean DEFAULT false,
  p_cod_amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_due numeric(12,3);
  v_is_cod boolean;
  v_message_en text;
  v_message_ar text;
  v_result jsonb;
BEGIN
  IF p_status NOT IN ('out_for_delivery', 'delivered', 'delivery_failed', 'returned') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_STATUS';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL
     OR v_order.assigned_to IS DISTINCT FROM auth.uid()
     OR v_order.fulfillment_method <> 'delivery' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'courier'
      AND p.status = 'active'
      AND p.brand_id = v_order.brand_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_due := round(
    greatest(coalesce(v_order.total, 0) - coalesce(v_order.advance_paid, 0), 0)::numeric,
    3
  );

  -- Treat order as COD/payment-aware if it's explicitly COD, OR if there's a remaining balance and the courier is confirming collection
  v_is_cod := lower(coalesce(v_order.payment_method, '')) IN ('cod', 'cash_on_delivery', 'cash on delivery', 'cash')
    OR (coalesce(v_order.payment_status, 'unpaid') IN ('unpaid', 'partial') AND v_due > 0 AND p_cod_collected);

  -- Completed deliveries are historical records and cannot be moved backwards.
  IF v_order.fulfillment_status = 'delivered' AND p_status <> 'delivered' THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_COMPLETED';
  END IF;

  -- Treat repeated requests as successful without duplicating timeline records.
  IF v_order.fulfillment_status = p_status
     AND NOT (
       p_status = 'delivered'
       AND v_is_cod
       AND v_order.cod_collected_at IS NULL
     ) THEN
    RETURN jsonb_build_object(
      'fulfillment_status', v_order.fulfillment_status,
      'order_status', v_order.status,
      'payment_status', v_order.payment_status,
      'cod_collected_amount', v_order.cod_collected_amount
    );
  END IF;

  IF p_status = 'delivered' AND v_is_cod AND v_order.cod_collected_at IS NULL THEN
    IF NOT p_cod_collected THEN
      RAISE EXCEPTION 'COD_CONFIRMATION_REQUIRED';
    END IF;

    IF p_cod_amount IS NULL OR abs(round(p_cod_amount, 3) - v_due) > 0.0005 THEN
      RAISE EXCEPTION 'COD_AMOUNT_MISMATCH';
    END IF;
  END IF;

  UPDATE public.orders
  SET fulfillment_status = p_status,
      delivery_notes = CASE
        WHEN p_notes IS NULL THEN delivery_notes
        ELSE NULLIF(btrim(p_notes), '')
      END,
      delivery_status_updated_at = now(),
      delivery_status_updated_by = auth.uid(),
      delivered_at = CASE
        WHEN p_status = 'delivered' THEN coalesce(delivered_at, now())
        ELSE delivered_at
      END,
      status = CASE
        WHEN p_status = 'delivered' THEN 'completed'
        ELSE status
      END,
      cod_collected_amount = CASE
        WHEN p_status = 'delivered' AND v_is_cod AND cod_collected_at IS NULL THEN v_due
        ELSE cod_collected_amount
      END,
      cod_collected_at = CASE
        WHEN p_status = 'delivered' AND v_is_cod AND cod_collected_at IS NULL THEN now()
        ELSE cod_collected_at
      END,
      cod_collected_by = CASE
        WHEN p_status = 'delivered' AND v_is_cod AND cod_collected_at IS NULL THEN auth.uid()
        ELSE cod_collected_by
      END,
      payment_status = CASE
        WHEN p_status = 'delivered' AND v_is_cod THEN 'paid'
        ELSE payment_status
      END,
      advance_paid = CASE
        WHEN p_status = 'delivered' AND v_is_cod THEN total
        ELSE advance_paid
      END,
      updated_at = now()
  WHERE id = p_order_id;

  SELECT
    CASE p_status
      WHEN 'out_for_delivery' THEN
        'Courier marked order #' || v_order.invoice_number || ' out for delivery'
      WHEN 'delivered' THEN
        'Courier marked order #' || v_order.invoice_number || ' delivered'
      WHEN 'delivery_failed' THEN
        'Courier reported delivery failed for order #' || v_order.invoice_number
      ELSE
        'Courier marked order #' || v_order.invoice_number || ' returned'
    END,
    CASE p_status
      WHEN 'out_for_delivery' THEN
        'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى خرج للتوصيل'
      WHEN 'delivered' THEN
        'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى تم التسليم'
      WHEN 'delivery_failed' THEN
        'أبلغ المندوب عن تعذر تسليم الطلب رقم ' || v_order.invoice_number
      ELSE
        'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى مرتجع'
    END
  INTO v_message_en, v_message_ar;

  INSERT INTO public.activity_logs
    (brand_id, user_id, order_id, action, message_en, message_ar, metadata)
  VALUES
    (
      v_order.brand_id,
      auth.uid(),
      v_order.id,
      'delivery_status',
      v_message_en,
      v_message_ar,
      jsonb_build_object(
        'previous_fulfillment_status', v_order.fulfillment_status,
        'fulfillment_status', p_status,
        'notes', NULLIF(btrim(p_notes), ''),
        'cod_collected', p_status = 'delivered' AND v_is_cod,
        'cod_amount', CASE
          WHEN p_status = 'delivered' AND v_is_cod THEN v_due
          ELSE NULL
        END
      )
    );

  SELECT jsonb_build_object(
    'fulfillment_status', o.fulfillment_status,
    'order_status', o.status,
    'payment_status', o.payment_status,
    'cod_collected_amount', o.cod_collected_amount
  )
  INTO v_result
  FROM public.orders o
  WHERE o.id = p_order_id;

  RETURN v_result;
END;
$$;
