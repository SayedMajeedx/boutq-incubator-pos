-- Migration: Aligns column and place_storefront_order function fallbacks to default to Bahrain's 10% standard VAT rate.
-- Contains a diagnostic DO block to report any brands currently on the 15% rate before setting new schema defaults.

-- 1. Report brands currently on 15% tax rate
DO $$
DECLARE
  v_brand record;
BEGIN
  RAISE NOTICE '=== REPORT: Brands with 15%% tax rate ===';
  FOR v_brand IN 
    SELECT brand_id, default_tax_rate, updated_at, (created_at = updated_at) as is_untouched 
    FROM public.business_settings 
    WHERE default_tax_rate = 15.00
  LOOP
    RAISE NOTICE 'Brand ID: %, Default Tax Rate: %, Updated At: %, Untouched: %', v_brand.brand_id, v_brand.default_tax_rate, v_brand.updated_at, v_brand.is_untouched;
  END LOOP;
END $$;

-- 2. Alter column default for default_tax_rate on business_settings to 10
ALTER TABLE public.business_settings ALTER COLUMN default_tax_rate SET DEFAULT 10;

-- 3. Recreate public.place_storefront_order with COALESCE(default_tax_rate, 10.0) fallback
CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
  p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
  p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL,
  p_shipping_fee numeric DEFAULT NULL, p_shipping_zone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_tax_rate numeric;
  v_vat_inclusive boolean;
  v_shipping_fee numeric;
  v_tax_amount numeric;
  v_taxable numeric;
  v_total numeric;
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

  -- Authoritatively apply VAT inclusive/exclusive configurations and custom shipping zone fees
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  
  -- Aligned fallback default_tax_rate to 10.0 instead of 15.0
  SELECT COALESCE(default_tax_rate, 10.0), COALESCE(vat_inclusive, false) INTO v_tax_rate, v_vat_inclusive
  FROM public.business_settings WHERE brand_id = v_brand_id;

  v_shipping_fee := COALESCE(p_shipping_fee, v_order.shipping);
  v_taxable := greatest(0, v_order.subtotal - v_order.discount);
  
  IF v_vat_inclusive THEN
    v_tax_amount := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping_fee;
  ELSE
    v_tax_amount := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax_amount + v_shipping_fee;
  END IF;

  UPDATE public.orders
  SET shipping = v_shipping_fee,
      tax_rate = v_tax_rate,
      tax_amount = v_tax_amount,
      total = v_total,
      delivery_address_snapshot = CASE 
        WHEN p_shipping_zone IS NOT NULL THEN COALESCE(delivery_address_snapshot, '{}'::jsonb) || jsonb_build_object('shipping_zone', p_shipping_zone)
        ELSE delivery_address_snapshot
      END
  WHERE id = v_order_id;

  -- Reload values to include recalculated totals in trigger or return payload
  v_result := v_result || jsonb_build_object('total', v_total, 'shipping', v_shipping_fee, 'tax_amount', v_tax_amount);

  RETURN v_result;
END;
$$;

-- Expose update privileges on functions to anon/authenticated
GRANT EXECUTE ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
