-- Invoice primary_color remains invoice-only. Storefront colors use this field.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_accent_color text,
  ADD COLUMN IF NOT EXISTS storefront_background_color text,
  ADD COLUMN IF NOT EXISTS storefront_text_color text;

GRANT SELECT (storefront_accent_color, storefront_background_color, storefront_text_color)
  ON public.business_settings TO anon;

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
       bs.storefront_accent_color, bs.storefront_background_color, bs.storefront_text_color
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;
