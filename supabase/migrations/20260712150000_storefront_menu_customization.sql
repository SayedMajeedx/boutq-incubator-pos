ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS menu_bg text,
  ADD COLUMN IF NOT EXISTS menu_fg text,
  ADD COLUMN IF NOT EXISTS menu_title_en text,
  ADD COLUMN IF NOT EXISTS menu_title_ar text,
  ADD COLUMN IF NOT EXISTS menu_show_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS menu_show_account boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS menu_show_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS menu_show_pages boolean NOT NULL DEFAULT true;

GRANT SELECT (menu_bg, menu_fg, menu_title_en, menu_title_ar, menu_show_home, menu_show_account, menu_show_orders, menu_show_pages)
ON public.business_settings TO anon, authenticated;

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
       bs.digital_delivery_enabled,
       bs.menu_bg, bs.menu_fg, bs.menu_title_en, bs.menu_title_ar,
       bs.menu_show_home, bs.menu_show_account, bs.menu_show_orders, bs.menu_show_pages
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;
