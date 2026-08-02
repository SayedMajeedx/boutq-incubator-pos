-- Semi-automated BenefitPay receipt verification.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS benefit_account_number text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS benefit_receipt_url text,
  ADD COLUMN IF NOT EXISTS benefit_receipt_key text,
  ADD COLUMN IF NOT EXISTS benefit_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pending_benefit_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 8388608),
  uploaded_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_benefit_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_benefit_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pending_benefit_receipts TO service_role;
CREATE INDEX IF NOT EXISTS pending_benefit_receipts_expiry_idx
  ON public.pending_benefit_receipts(expires_at) WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_public_benefit_settings(p_brand_id uuid)
RETURNS TABLE(benefit_account_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bs.benefit_account_number
  FROM public.business_settings bs
  JOIN public.brands b ON b.id = bs.brand_id
  WHERE bs.brand_id = p_brand_id AND b.is_active = true AND bs.benefit_enabled = true;
$$;
REVOKE ALL ON FUNCTION public.get_public_benefit_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_benefit_settings(uuid) TO anon, authenticated;

-- The previous checkout implementation remains private and is called only by
-- this receipt-aware wrapper. All browser checkout calls now include the
-- optional receipt slot parameter, including non-Benefit orders (NULL).
REVOKE ALL ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;

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
  SELECT id INTO v_brand_id FROM public.brands
  WHERE slug = p_brand_slug AND is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  IF p_payment_method = 'benefit' THEN
    IF p_benefit_receipt_id IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_REQUIRED'; END IF;
    SELECT * INTO v_receipt FROM public.pending_benefit_receipts
    WHERE id = p_benefit_receipt_id AND brand_id = v_brand_id
      AND uploaded_at IS NOT NULL AND consumed_at IS NULL AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID'; END IF;
  ELSIF p_benefit_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  v_result := public.place_storefront_order(
    p_brand_slug, p_customer, p_items, p_payment_method, p_notes,
    p_fulfillment, p_branch_id, p_digital_channel, p_digital_contact, p_promo_code
  );
  v_order_id := (v_result->>'order_id')::uuid;

  IF p_payment_method = 'benefit' THEN
    UPDATE public.orders SET
      status = 'pending_verification', payment_status = 'unpaid',
      benefit_receipt_url = v_receipt.public_url,
      benefit_receipt_key = v_receipt.object_key
    WHERE id = v_order_id AND brand_id = v_brand_id;
    UPDATE public.pending_benefit_receipts SET consumed_at = now() WHERE id = v_receipt.id;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text,text,uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_benefit_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_url IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND'; END IF;
  IF v_order.payment_status = 'paid' THEN RETURN jsonb_build_object('approved', true, 'already_paid', true); END IF;
  UPDATE public.orders SET status = 'confirmed', payment_status = 'paid',
    advance_paid = total, benefit_verified_at = now(), benefit_verified_by = auth.uid(), updated_at = now()
  WHERE id = p_order_id;
  RETURN jsonb_build_object('approved', true);
END;
$$;
REVOKE ALL ON FUNCTION public.approve_benefit_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_benefit_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
