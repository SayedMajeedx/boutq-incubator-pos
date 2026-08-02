ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS show_header_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_hero_title boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_hero_about boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_footer_name boolean NOT NULL DEFAULT true;

-- The public view uses caller permissions, so these columns must be readable by
-- anonymous storefront visitors just like the other public theme fields.
GRANT SELECT (show_header_name, show_hero_title, show_hero_about, show_footer_name)
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
       bs.show_header_name, bs.show_hero_title, bs.show_hero_about, bs.show_footer_name
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;
