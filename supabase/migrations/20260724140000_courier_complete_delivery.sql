-- RPC function for atomic courier delivery completion, cash collection, and notes traceability
CREATE OR REPLACE FUNCTION public.courier_complete_delivery(
  p_order_id UUID,
  p_collected_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_user_id UUID;
  v_user_role TEXT;
  v_new_paid_amount NUMERIC;
  v_new_payment_status TEXT;
  v_updated_notes TEXT;
  v_courier_name TEXT;
BEGIN
  -- 1. Security Guardrail: Check for negative collected amount
  IF p_collected_amount < 0 THEN
    RAISE EXCEPTION 'Collected amount cannot be negative';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get order record with row lock
  SELECT id, brand_id, total, COALESCE(advance_paid, 0) AS current_paid, payment_status, fulfillment_status, assigned_to, delivery_notes
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Verify authorization (assigned courier or admin/staff/superadmin)
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  IF v_order.assigned_to IS DISTINCT FROM v_user_id AND COALESCE(v_user_role, '') NOT IN ('admin', 'superadmin', 'staff') THEN
    RAISE EXCEPTION 'Not authorized to complete delivery for this order';
  END IF;

  -- 2. Calculate new paid amount and payment status
  v_new_paid_amount := COALESCE(v_order.current_paid, 0) + COALESCE(p_collected_amount, 0);

  IF v_new_paid_amount >= v_order.total THEN
    v_new_payment_status := 'paid';
  ELSIF v_new_paid_amount > 0 THEN
    v_new_payment_status := 'partially_paid';
  ELSE
    v_new_payment_status := COALESCE(v_order.payment_status, 'unpaid');
  END IF;

  -- 3. Get Courier Name for notes traceability
  SELECT COALESCE(full_name, email, 'Courier') INTO v_courier_name
  FROM public.profiles
  WHERE id = v_user_id;

  -- Append delivery notes
  IF p_notes IS NOT NULL AND trim(p_notes) <> '' THEN
    v_updated_notes := COALESCE(v_order.delivery_notes || E'\n', '') || 
      '[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' - ' || v_courier_name || ']: ' || trim(p_notes);
  ELSE
    v_updated_notes := v_order.delivery_notes;
  END IF;

  -- 4. Execute atomic order update
  UPDATE public.orders
  SET 
    advance_paid = v_new_paid_amount,
    cod_collected_amount = COALESCE(p_collected_amount, 0),
    cod_collected_at = NOW(),
    cod_collected_by = v_user_id,
    payment_status = v_new_payment_status,
    fulfillment_status = 'COMPLETED',
    delivery_notes = v_updated_notes,
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 5. Insert transition log into activity_log
  BEGIN
    INSERT INTO public.activity_log (
      brand_id,
      user_id,
      action,
      entity_type,
      entity_id,
      details
    ) VALUES (
      v_order.brand_id,
      v_user_id,
      'courier_completed_delivery',
      'order',
      p_order_id::text,
      jsonb_build_object(
        'collected_amount', p_collected_amount,
        'new_paid_amount', v_new_paid_amount,
        'payment_status', v_new_payment_status,
        'fulfillment_status', 'COMPLETED',
        'notes', p_notes,
        'courier', v_courier_name
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore activity_log errors if table schema or trigger differs
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'paid_amount', v_new_paid_amount,
    'payment_status', v_new_payment_status,
    'fulfillment_status', 'COMPLETED'
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.courier_complete_delivery(UUID, NUMERIC, TEXT) TO authenticated;
