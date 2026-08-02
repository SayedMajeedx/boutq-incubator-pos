-- PostgREST cannot expose overloaded RPCs when trailing parameters have
-- defaults. Keep the proven checkout implementation, but give the private
-- 10-argument implementation a distinct name so the public API is unique.

DO $$
BEGIN
  ALTER FUNCTION public.place_storefront_order(
    text, jsonb, jsonb, text, text, text, uuid, text, text, text
  ) RENAME TO place_storefront_order_core;
EXCEPTION
  WHEN duplicate_function THEN NULL;
  WHEN duplicate_object THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

REVOKE ALL ON FUNCTION public.place_storefront_order_core(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

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
        benefit_receipt_url = v_receipt.public_url,
        benefit_receipt_key = v_receipt.object_key
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

NOTIFY pgrst, 'reload schema';
