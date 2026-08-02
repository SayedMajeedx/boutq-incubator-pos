-- Make courier delivery actions authoritative, auditable, and payment-aware.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS courier_out_for_delivery_message_en text
    DEFAULT 'Hi {{customer_name}}, your order #{{invoice_number}} from {{brand_name}} is now out for delivery.',
  ADD COLUMN IF NOT EXISTS courier_out_for_delivery_message_ar text
    DEFAULT 'مرحباً {{customer_name}}، طلبك رقم {{invoice_number}} من {{brand_name}} خرج الآن للتوصيل.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cod_collected_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS cod_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_collected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.courier_update_delivery(uuid, text, text);

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
  v_message_en text;
  v_message_ar text;
BEGIN
  IF p_status NOT IN ('out_for_delivery', 'delivered', 'delivery_failed', 'returned') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_STATUS';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.assigned_to IS DISTINCT FROM auth.uid()
     OR v_order.fulfillment_method <> 'delivery' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'courier' AND p.status = 'active'
      AND p.brand_id = v_order.brand_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_due := round(greatest(v_order.total - coalesce(v_order.advance_paid, 0), 0)::numeric, 3);
  IF p_status = 'delivered' AND v_order.payment_method = 'cod'
     AND v_order.cod_collected_at IS NULL THEN
    IF NOT p_cod_collected THEN
      RAISE EXCEPTION 'COD_CONFIRMATION_REQUIRED';
    END IF;
    IF p_cod_amount IS NULL OR abs(round(p_cod_amount, 3) - v_due) > 0.0005 THEN
      RAISE EXCEPTION 'COD_AMOUNT_MISMATCH';
    END IF;
  END IF;

  UPDATE public.orders
  SET fulfillment_status = p_status,
      delivery_notes = NULLIF(btrim(p_notes), ''),
      delivery_status_updated_at = now(),
      delivery_status_updated_by = auth.uid(),
      delivered_at = CASE WHEN p_status = 'delivered' THEN coalesce(delivered_at, now()) ELSE delivered_at END,
      status = CASE WHEN p_status = 'delivered' THEN 'completed' ELSE status END,
      cod_collected_amount = CASE
        WHEN p_status = 'delivered' AND payment_method = 'cod' AND cod_collected_at IS NULL THEN v_due
        ELSE cod_collected_amount END,
      cod_collected_at = CASE
        WHEN p_status = 'delivered' AND payment_method = 'cod' AND cod_collected_at IS NULL THEN now()
        ELSE cod_collected_at END,
      cod_collected_by = CASE
        WHEN p_status = 'delivered' AND payment_method = 'cod' AND cod_collected_at IS NULL THEN auth.uid()
        ELSE cod_collected_by END,
      payment_status = CASE
        WHEN p_status = 'delivered' AND payment_method = 'cod' THEN 'paid'
        ELSE payment_status END,
      advance_paid = CASE
        WHEN p_status = 'delivered' AND payment_method = 'cod' THEN total
        ELSE advance_paid END,
      updated_at = now()
  WHERE id = p_order_id;

  SELECT
    CASE p_status
      WHEN 'out_for_delivery' THEN 'Courier marked order #' || v_order.invoice_number || ' out for delivery'
      WHEN 'delivered' THEN 'Courier marked order #' || v_order.invoice_number || ' delivered'
      WHEN 'delivery_failed' THEN 'Courier reported delivery failed for order #' || v_order.invoice_number
      ELSE 'Courier marked order #' || v_order.invoice_number || ' returned'
    END,
    CASE p_status
      WHEN 'out_for_delivery' THEN 'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى خرج للتوصيل'
      WHEN 'delivered' THEN 'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى تم التسليم'
      WHEN 'delivery_failed' THEN 'أبلغ المندوب عن تعذر تسليم الطلب رقم ' || v_order.invoice_number
      ELSE 'قام المندوب بتحديث الطلب رقم ' || v_order.invoice_number || ' إلى مرتجع'
    END
  INTO v_message_en, v_message_ar;

  INSERT INTO public.activity_logs
    (brand_id, user_id, order_id, action, message_en, message_ar, metadata)
  VALUES
    (v_order.brand_id, auth.uid(), v_order.id, 'delivery_status', v_message_en, v_message_ar,
     jsonb_build_object(
       'fulfillment_status', p_status,
       'notes', NULLIF(btrim(p_notes), ''),
       'cod_collected', p_status = 'delivered' AND v_order.payment_method = 'cod',
       'cod_amount', CASE WHEN p_status = 'delivered' AND v_order.payment_method = 'cod' THEN v_due ELSE NULL END
     ));

  RETURN jsonb_build_object(
    'fulfillment_status', p_status,
    'order_status', CASE WHEN p_status = 'delivered' THEN 'completed' ELSE v_order.status END,
    'payment_status', CASE WHEN p_status = 'delivered' AND v_order.payment_method = 'cod' THEN 'paid' ELSE v_order.payment_status END,
    'cod_collected_amount', CASE WHEN p_status = 'delivered' AND v_order.payment_method = 'cod' THEN v_due ELSE v_order.cod_collected_amount END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_courier_delivery_message(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_settings public.business_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL OR v_order.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = v_order.brand_id LIMIT 1;
  RETURN jsonb_build_object(
    'brand_name', coalesce(v_settings.business_name, 'Boutq Store'),
    'message_en', coalesce(v_settings.courier_out_for_delivery_message_en,
      'Hi {{customer_name}}, your order #{{invoice_number}} from {{brand_name}} is now out for delivery.'),
    'message_ar', coalesce(v_settings.courier_out_for_delivery_message_ar,
      'مرحباً {{customer_name}}، طلبك رقم {{invoice_number}} من {{brand_name}} خرج الآن للتوصيل.')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_update_delivery(uuid, text, text, boolean, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_courier_delivery_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_update_delivery(uuid, text, text, boolean, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_courier_delivery_message(uuid) TO authenticated;
