-- Migration: Advanced Settings Upgrades (VAT configurations, custom transaction fees, secure payment keys, and shipping matrix)

ALTER TABLE public.business_settings 
  ADD COLUMN IF NOT EXISTS vat_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_processing_fee numeric(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS benefit_processing_fee numeric(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS card_public_key text,
  ADD COLUMN IF NOT EXISTS card_secret_key text,
  ADD COLUMN IF NOT EXISTS shipping_zones jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Recreate the public place_storefront_order function to accept shipping matrix selections, override fees, and calculate taxes authoritatively
DROP FUNCTION IF EXISTS public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid);

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
  
  SELECT COALESCE(default_tax_rate, 15.0), COALESCE(vat_inclusive, false) INTO v_tax_rate, v_vat_inclusive
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

REVOKE ALL ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text
) TO anon, authenticated;

-- Expose vat_inclusive and shipping_zones in public brand_public_settings view
DROP VIEW IF EXISTS public.brand_public_settings;

CREATE VIEW public.brand_public_settings WITH (security_invoker = true) AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency, bs.primary_color, bs.text_color, bs.background_color, bs.font_family, bs.font_url,
 bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url, bs.footer_note, bs.delivery_fee, bs.pickup_enabled, bs.delivery_enabled,
 bs.logo_size, bs.logo_align, bs.header_bg, bs.header_fg, bs.footer_bg, bs.footer_fg, bs.heading_color, bs.link_color, bs.btn_primary_bg, bs.btn_primary_fg,
 bs.btn_secondary_bg, bs.btn_secondary_fg, bs.btn_checkout_bg, bs.btn_checkout_fg, bs.pages, bs.whatsapp_enabled, bs.whatsapp_number, bs.socials, bs.favicon_url,
 bs.show_header_name, bs.show_hero_title, bs.show_hero_about, bs.show_footer_name, bs.storefront_font_en, bs.storefront_font_ar, bs.hero_title_size, bs.hero_title_color,
 bs.hero_title_align, bs.storefront_font_en_url, bs.storefront_font_ar_url, bs.hero_title_en, bs.hero_title_ar, bs.storefront_accent_color,
 bs.storefront_background_color, bs.storefront_text_color, bs.digital_delivery_enabled, bs.menu_bg, bs.menu_fg, bs.menu_title_en, bs.menu_title_ar,
 bs.menu_show_home, bs.menu_show_account, bs.menu_show_orders, bs.menu_show_pages, bs.home_promo_cards, bs.show_new_arrivals, bs.show_best_sellers,
 bs.new_arrivals_title_en, bs.new_arrivals_title_ar, bs.best_sellers_title_en, bs.best_sellers_title_ar,
 bs.announcement_enabled, bs.announcement_text_en, bs.announcement_text_ar, bs.announcement_bg, bs.announcement_fg,
 bs.announcement_bold, bs.announcement_italic, bs.announcement_dismissible, bs.announcement_scope, bs.announcement_audience,
 bs.global_sale_badges_enabled, bs.cart_drawer_checkout_bg, bs.cart_drawer_checkout_fg,
 bs.vat_inclusive, bs.shipping_zones
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

-- Grant column-level select privileges on the newly exposed columns in the view
GRANT SELECT (vat_inclusive, shipping_zones) ON public.business_settings TO anon, authenticated;

-- Grant select on new payments settings columns to authenticated
GRANT SELECT (card_processing_fee, benefit_processing_fee, card_public_key, card_secret_key) 
  ON public.business_settings TO authenticated;

-- Grant select on public card gateway key to anonymous users as well
GRANT SELECT (card_public_key) 
  ON public.business_settings TO anon;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';


