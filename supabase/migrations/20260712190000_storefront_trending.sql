ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS featured_trending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_sale_badge boolean NOT NULL DEFAULT true;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS global_sale_badges_enabled boolean NOT NULL DEFAULT true;
GRANT SELECT (global_sale_badges_enabled) ON public.business_settings TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.product_engagement_daily (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  view_count bigint NOT NULL DEFAULT 0,
  click_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, event_date)
);
ALTER TABLE public.product_engagement_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_engagement_daily FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_storefront_product_engagement(p_brand_slug text, p_product_id uuid, p_event text DEFAULT 'view')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand_id uuid;
BEGIN
  IF p_event NOT IN ('view','click') THEN RAISE EXCEPTION 'Invalid event'; END IF;
  SELECT b.id INTO v_brand_id FROM brands b JOIN products p ON p.brand_id=b.id
   WHERE b.slug=p_brand_slug AND b.is_active=true AND p.id=p_product_id AND p.is_active=true;
  IF v_brand_id IS NULL THEN RETURN; END IF;
  INSERT INTO product_engagement_daily(brand_id, product_id, event_date, view_count, click_count)
  VALUES (v_brand_id, p_product_id, CURRENT_DATE, CASE WHEN p_event='view' THEN 1 ELSE 0 END, CASE WHEN p_event='click' THEN 1 ELSE 0 END)
  ON CONFLICT(product_id,event_date) DO UPDATE SET
    view_count=product_engagement_daily.view_count + CASE WHEN p_event='view' THEN 1 ELSE 0 END,
    click_count=product_engagement_daily.click_count + CASE WHEN p_event='click' THEN 1 ELSE 0 END;
END $$;
REVOKE ALL ON FUNCTION public.record_storefront_product_engagement(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_product_engagement(text,uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_storefront_trending(p_brand_slug text, p_limit integer DEFAULT 8)
RETURNS TABLE(product_id uuid, engagement_score bigint, manually_featured boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
    COALESCE(SUM(e.view_count + e.click_count * 3) FILTER (WHERE e.event_date >= CURRENT_DATE - 30),0)::bigint,
    p.featured_trending
  FROM products p JOIN brands b ON b.id=p.brand_id
  LEFT JOIN product_engagement_daily e ON e.product_id=p.id
  WHERE b.slug=p_brand_slug AND b.is_active=true AND p.is_active=true
  GROUP BY p.id,p.featured_trending,p.created_at
  -- Manual featuring supplies an early-store boost; real engagement can overtake it.
  ORDER BY (COALESCE(SUM(e.view_count + e.click_count * 3) FILTER (WHERE e.event_date >= CURRENT_DATE - 30),0)
            + CASE WHEN p.featured_trending THEN 100 ELSE 0 END) DESC, p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,8),1),24)
$$;
REVOKE ALL ON FUNCTION public.get_storefront_trending(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_trending(text,integer) TO anon, authenticated;

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
 bs.announcement_bold, bs.announcement_italic, bs.announcement_dismissible, bs.announcement_scope, bs.announcement_audience,
 bs.global_sale_badges_enabled
FROM public.business_settings bs JOIN public.brands b ON b.id=bs.brand_id WHERE b.is_active=true;
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;
