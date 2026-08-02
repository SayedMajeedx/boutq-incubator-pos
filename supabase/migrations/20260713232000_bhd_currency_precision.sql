-- Bahraini Dinar is divided into 1,000 fils. Preserve three fractional digits
-- throughout storage and checkout calculations instead of rounding to cents.
ALTER TABLE public.product_variants
  ALTER COLUMN cost_price TYPE numeric(14,3) USING cost_price::numeric(14,3),
  ALTER COLUMN selling_price TYPE numeric(14,3) USING selling_price::numeric(14,3),
  ALTER COLUMN original_price TYPE numeric(14,3) USING original_price::numeric(14,3);

ALTER TABLE public.customization_options
  ALTER COLUMN price_delta TYPE numeric(14,3) USING price_delta::numeric(14,3);

ALTER TABLE public.orders
  ALTER COLUMN subtotal TYPE numeric(14,3) USING subtotal::numeric(14,3),
  ALTER COLUMN discount TYPE numeric(14,3) USING discount::numeric(14,3),
  ALTER COLUMN tax_amount TYPE numeric(14,3) USING tax_amount::numeric(14,3),
  ALTER COLUMN shipping TYPE numeric(14,3) USING shipping::numeric(14,3),
  ALTER COLUMN total TYPE numeric(14,3) USING total::numeric(14,3),
  ALTER COLUMN advance_paid TYPE numeric(14,3) USING advance_paid::numeric(14,3);

ALTER TABLE public.order_items
  ALTER COLUMN unit_price TYPE numeric(14,3) USING unit_price::numeric(14,3),
  ALTER COLUMN customization_total TYPE numeric(14,3) USING customization_total::numeric(14,3),
  ALTER COLUMN line_total TYPE numeric(14,3) USING line_total::numeric(14,3);

ALTER TABLE public.expenses
  ALTER COLUMN amount TYPE numeric(14,3) USING amount::numeric(14,3),
  ALTER COLUMN tax_amount TYPE numeric(14,3) USING tax_amount::numeric(14,3);

-- PostgreSQL does not allow changing the type of a column exposed by a view.
-- Recreate the public projection around the delivery_fee type change.
DROP VIEW IF EXISTS public.brand_public_settings;

ALTER TABLE public.business_settings
  ALTER COLUMN delivery_fee TYPE numeric(14,3) USING delivery_fee::numeric(14,3);

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
 bs.global_sale_badges_enabled, bs.cart_drawer_checkout_bg, bs.cart_drawer_checkout_fg
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- The hardened storefront allocator predates three-decimal BHD support and
-- contains local numeric(10,2) variables. Recreate the same secured function
-- body with widened numeric typemods, without changing its authorization or
-- business rules.
DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.place_storefront_order_internal_20260710(text,jsonb,jsonb,text,text,text,uuid)'::regprocedure
  ) INTO function_definition;

  function_definition := replace(function_definition, 'numeric(10,2)', 'numeric(14,3)');
  function_definition := replace(function_definition, 'numeric(10, 2)', 'numeric(14,3)');
  EXECUTE function_definition;
END;
$$;
