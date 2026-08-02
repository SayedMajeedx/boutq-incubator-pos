ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS announcement_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_text_en text,
  ADD COLUMN IF NOT EXISTS announcement_text_ar text,
  ADD COLUMN IF NOT EXISTS announcement_bg text NOT NULL DEFAULT '#111111',
  ADD COLUMN IF NOT EXISTS announcement_fg text NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS announcement_bold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_italic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_dismissible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS announcement_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS announcement_audience text NOT NULL DEFAULT 'all';

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_announcement_scope_check;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_announcement_scope_check CHECK (announcement_scope IN ('all','home','catalog','checkout'));
ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_announcement_audience_check;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_announcement_audience_check CHECK (announcement_audience IN ('all','guest','authenticated'));

GRANT SELECT (announcement_enabled, announcement_text_en, announcement_text_ar, announcement_bg,
 announcement_fg, announcement_bold, announcement_italic, announcement_dismissible,
 announcement_scope, announcement_audience) ON public.business_settings TO anon, authenticated;

DROP VIEW IF EXISTS public.brand_public_settings CASCADE;
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
 bs.announcement_bold, bs.announcement_italic, bs.announcement_dismissible, bs.announcement_scope, bs.announcement_audience
FROM public.business_settings bs JOIN public.brands b ON b.id = bs.brand_id WHERE b.is_active = true;
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;
