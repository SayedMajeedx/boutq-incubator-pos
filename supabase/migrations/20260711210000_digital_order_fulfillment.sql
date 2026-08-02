ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS digital_delivery_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS digital_delivery_channel text,
  ADD COLUMN IF NOT EXISTS digital_delivery_contact text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_method_check
  CHECK (fulfillment_method IN ('delivery', 'pickup', 'digital'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_digital_delivery_channel_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_digital_delivery_channel_check
  CHECK (digital_delivery_channel IS NULL OR digital_delivery_channel IN ('email', 'whatsapp'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_digital_delivery_details_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_digital_delivery_details_check CHECK (
  (fulfillment_method <> 'digital' AND digital_delivery_channel IS NULL AND digital_delivery_contact IS NULL)
  OR
  (fulfillment_method = 'digital' AND digital_delivery_channel IN ('email', 'whatsapp')
    AND digital_delivery_contact IS NOT NULL AND length(trim(digital_delivery_contact)) > 0)
);

GRANT SELECT (digital_delivery_enabled) ON public.business_settings TO anon;

DROP VIEW IF EXISTS public.brand_public_settings CASCADE;
CREATE VIEW public.brand_public_settings
WITH (security_invoker = true) AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency,
       bs.primary_color, bs.text_color, bs.background_color,
       bs.font_family, bs.font_url,
       bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url,
       bs.footer_note, bs.delivery_fee, bs.pickup_enabled, bs.delivery_enabled,
       bs.logo_size, bs.logo_align,
       bs.header_bg, bs.header_fg, bs.footer_bg, bs.footer_fg,
       bs.heading_color, bs.link_color,
       bs.btn_primary_bg, bs.btn_primary_fg, bs.btn_secondary_bg, bs.btn_secondary_fg,
       bs.btn_checkout_bg, bs.btn_checkout_fg,
       bs.pages, bs.whatsapp_enabled, bs.whatsapp_number,
       bs.socials, bs.favicon_url,
       bs.show_header_name, bs.show_hero_title, bs.show_hero_about, bs.show_footer_name,
       bs.storefront_font_en, bs.storefront_font_ar,
       bs.hero_title_size, bs.hero_title_color, bs.hero_title_align,
       bs.storefront_font_en_url, bs.storefront_font_ar_url,
       bs.hero_title_en, bs.hero_title_ar,
       bs.storefront_accent_color, bs.storefront_background_color, bs.storefront_text_color,
       bs.digital_delivery_enabled
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL,
  p_digital_contact text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_customer_id uuid;
  v_email_token uuid;
  v_invoice_number integer;
  v_safe_customer jsonb;
  v_safe_items jsonb;
  v_brand_id uuid;
  v_digital_enabled boolean;
  v_pickup_enabled boolean;
BEGIN
  IF p_fulfillment NOT IN ('delivery', 'pickup', 'digital') THEN
    RAISE EXCEPTION 'INVALID_FULFILLMENT';
  END IF;

  SELECT b.id, COALESCE(bs.digital_delivery_enabled, false)
    INTO v_brand_id, v_digital_enabled
  FROM public.brands b
  LEFT JOIN public.business_settings bs ON bs.brand_id = b.id
  WHERE b.slug = p_brand_slug AND b.is_active = true;

  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;
  IF p_fulfillment = 'digital' THEN
    IF NOT v_digital_enabled THEN RAISE EXCEPTION 'DIGITAL_DELIVERY_DISABLED'; END IF;
    IF p_digital_channel NOT IN ('email', 'whatsapp') THEN RAISE EXCEPTION 'INVALID_DIGITAL_CHANNEL'; END IF;
    IF NULLIF(trim(p_digital_contact), '') IS NULL THEN RAISE EXCEPTION 'DIGITAL_CONTACT_REQUIRED'; END IF;
    IF p_digital_channel = 'email' AND trim(p_digital_contact) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'INVALID_DIGITAL_EMAIL';
    END IF;
  ELSIF p_digital_channel IS NOT NULL OR p_digital_contact IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_DIGITAL_DETAILS';
  END IF;

  v_safe_customer := COALESCE(p_customer, '{}'::jsonb) - 'phone' - 'email';
  SELECT COALESCE(jsonb_agg(
    CASE WHEN item ? 'custom_field_values'
      THEN (item - 'custom_fields') || jsonb_build_object('custom_fields', item->'custom_field_values')
      ELSE item END
  ), '[]'::jsonb)
  INTO v_safe_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  IF p_fulfillment = 'digital' THEN
    -- The hardened internal allocator already supports zero-fee/address-free pickup.
    -- Temporarily enable that path only inside this transaction; the value is
    -- restored before commit and is never exposed to other transactions.
    SELECT pickup_enabled INTO v_pickup_enabled
      FROM public.business_settings WHERE brand_id = v_brand_id FOR UPDATE;
    UPDATE public.business_settings SET pickup_enabled = true WHERE brand_id = v_brand_id;
    v_result := public.place_storefront_order_internal_20260710(
      p_brand_slug, v_safe_customer, v_safe_items, p_payment_method,
      p_notes, 'pickup', NULL
    );
    UPDATE public.business_settings SET pickup_enabled = v_pickup_enabled WHERE brand_id = v_brand_id;
    UPDATE public.orders SET
      fulfillment_method = 'digital', branch_id = NULL,
      digital_delivery_channel = p_digital_channel,
      digital_delivery_contact = trim(p_digital_contact)
    WHERE id = (v_result->>'order_id')::uuid;
  ELSE
    v_result := public.place_storefront_order_internal_20260710(
      p_brand_slug, v_safe_customer, v_safe_items, p_payment_method,
      p_notes, p_fulfillment, p_branch_id
    );
  END IF;

  SELECT customer_id, confirmation_email_token, invoice_number
    INTO v_customer_id, v_email_token, v_invoice_number
  FROM public.orders WHERE id = (v_result->>'order_id')::uuid;

  UPDATE public.customers SET
    phone = NULLIF(trim(p_customer->>'phone'), ''),
    email = NULLIF(trim(p_customer->>'email'), '')
  WHERE id = v_customer_id;

  RETURN v_result || jsonb_build_object(
    'confirmation_email_token', v_email_token,
    'invoice_number', v_invoice_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text) TO anon, authenticated;
