-- Private BenefitPay receipt storage and 30-day post-verification retention.
-- Only opaque R2 object keys are persisted. Viewing is authorized and signed
-- by the server for five minutes at a time.

ALTER TABLE public.pending_benefit_receipts
  ALTER COLUMN public_url DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS benefit_receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_receipt_delete_after timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_receipt_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_receipt_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_receipt_rejected_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_benefit_receipt_cleanup_idx
  ON public.orders(benefit_receipt_delete_after)
  WHERE benefit_receipt_key IS NOT NULL
    AND benefit_receipt_delete_after IS NOT NULL;

-- Replace the receipt-aware public wrapper without changing its API shape.
CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
  p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
  p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_result jsonb;
  v_order_id uuid;
BEGIN
  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE slug = p_brand_slug AND is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  IF p_payment_method = 'benefit' THEN
    IF p_benefit_receipt_id IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_REQUIRED'; END IF;
    SELECT * INTO v_receipt
    FROM public.pending_benefit_receipts
    WHERE id = p_benefit_receipt_id
      AND brand_id = v_brand_id
      AND uploaded_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID'; END IF;
  ELSIF p_benefit_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  v_result := public.place_storefront_order_core(
    p_brand_slug, p_customer, p_items, p_payment_method, p_notes,
    p_fulfillment, p_branch_id, p_digital_channel, p_digital_contact, p_promo_code
  );
  v_order_id := (v_result->>'order_id')::uuid;

  IF p_payment_method = 'benefit' THEN
    UPDATE public.orders
    SET status = 'pending_verification',
        payment_status = 'unpaid',
        benefit_receipt_url = NULL,
        benefit_receipt_key = v_receipt.object_key,
        benefit_receipt_uploaded_at = v_receipt.uploaded_at,
        -- Never retain an unreviewed receipt indefinitely. Approval below
        -- starts a fresh 30-day window; rejection deletes it immediately.
        benefit_receipt_delete_after = coalesce(v_receipt.uploaded_at, now()) + interval '30 days',
        benefit_receipt_deleted_at = NULL,
        benefit_receipt_rejected_at = NULL,
        benefit_receipt_rejected_by = NULL
    WHERE id = v_order_id AND brand_id = v_brand_id;

    UPDATE public.pending_benefit_receipts
    SET consumed_at = now()
    WHERE id = v_receipt.id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_benefit_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_key IS NULL THEN
    RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('approved', true, 'already_paid', true);
  END IF;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'paid',
      advance_paid = total,
      benefit_verified_at = now(),
      benefit_verified_by = auth.uid(),
      benefit_receipt_delete_after = now() + interval '30 days',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'approved', true,
    'receipt_delete_after', now() + interval '30 days'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_benefit_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_benefit_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_benefit_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_key IS NULL THEN
    RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND';
  END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'PAYMENT_ALREADY_APPROVED'; END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'unpaid',
      benefit_receipt_rejected_at = now(),
      benefit_receipt_rejected_by = auth.uid(),
      benefit_receipt_delete_after = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'rejected', true,
    'object_key', v_order.benefit_receipt_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_benefit_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_benefit_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
