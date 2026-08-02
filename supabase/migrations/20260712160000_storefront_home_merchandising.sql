ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS home_promo_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_new_arrivals boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_best_sellers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_arrivals_title_en text,
  ADD COLUMN IF NOT EXISTS new_arrivals_title_ar text,
  ADD COLUMN IF NOT EXISTS best_sellers_title_en text,
  ADD COLUMN IF NOT EXISTS best_sellers_title_ar text;

GRANT SELECT (home_promo_cards, show_new_arrivals, show_best_sellers,
  new_arrivals_title_en, new_arrivals_title_ar, best_sellers_title_en, best_sellers_title_ar)
ON public.business_settings TO anon, authenticated;

DROP VIEW IF EXISTS public.brand_public_settings CASCADE;
CREATE VIEW public.brand_public_settings
WITH (security_invoker = true) AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency,
       bs.primary_color, bs.text_color, bs.background_color, bs.font_family, bs.font_url,
       bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url,
       bs.footer_note, bs.delivery_fee, bs.pickup_enabled, bs.delivery_enabled,
       bs.logo_size, bs.logo_align, bs.header_bg, bs.header_fg, bs.footer_bg, bs.footer_fg,
       bs.heading_color, bs.link_color, bs.btn_primary_bg, bs.btn_primary_fg,
       bs.btn_secondary_bg, bs.btn_secondary_fg, bs.btn_checkout_bg, bs.btn_checkout_fg,
       bs.pages, bs.whatsapp_enabled, bs.whatsapp_number, bs.socials, bs.favicon_url,
       bs.show_header_name, bs.show_hero_title, bs.show_hero_about, bs.show_footer_name,
       bs.storefront_font_en, bs.storefront_font_ar, bs.hero_title_size, bs.hero_title_color,
       bs.hero_title_align, bs.storefront_font_en_url, bs.storefront_font_ar_url,
       bs.hero_title_en, bs.hero_title_ar, bs.storefront_accent_color,
       bs.storefront_background_color, bs.storefront_text_color, bs.digital_delivery_enabled,
       bs.menu_bg, bs.menu_fg, bs.menu_title_en, bs.menu_title_ar,
       bs.menu_show_home, bs.menu_show_account, bs.menu_show_orders, bs.menu_show_pages,
       bs.home_promo_cards, bs.show_new_arrivals, bs.show_best_sellers,
       bs.new_arrivals_title_en, bs.new_arrivals_title_ar,
       bs.best_sellers_title_en, bs.best_sellers_title_ar
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- Returns aggregate product popularity only. No order/customer fields are exposed.
CREATE OR REPLACE FUNCTION public.get_storefront_best_sellers(p_brand_slug text, p_limit integer DEFAULT 8)
RETURNS TABLE(product_id uuid, units_sold bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT oi.product_id, SUM(oi.quantity)::bigint AS units_sold
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.brands b ON b.id = o.brand_id
  JOIN public.products p ON p.id = oi.product_id AND p.brand_id = b.id
  WHERE b.slug = p_brand_slug
    AND b.is_active = true
    AND p.is_active = true
    AND o.status NOT IN ('cancelled', 'draft')
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
  ORDER BY units_sold DESC, oi.product_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 24);
$$;

REVOKE ALL ON FUNCTION public.get_storefront_best_sellers(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_best_sellers(text, integer) TO anon, authenticated;
