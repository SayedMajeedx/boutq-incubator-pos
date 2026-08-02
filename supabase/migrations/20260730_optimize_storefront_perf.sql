-- Composite performance indexes for storefront queries
CREATE INDEX IF NOT EXISTS idx_products_brand_active_created ON public.products(brand_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_brand_active_sort ON public.categories(brand_id, is_active, sort_order ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_settings_brand_id ON public.business_settings(brand_id);
CREATE INDEX IF NOT EXISTS idx_brands_slug_active ON public.brands(slug, is_active);

-- Consolidated RPC for public storefront page data
CREATE OR REPLACE FUNCTION public.get_storefront_page_data(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_brand jsonb;
  v_settings jsonb;
  v_benefit jsonb;
  v_tracking jsonb;
  v_products jsonb;
  v_categories jsonb;
  v_bestsellers jsonb;
  v_trending jsonb;
  v_brand_id uuid;
BEGIN
  -- 1. Fetch brand
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name_en', b.name_en,
    'name_ar', b.name_ar,
    'logo_url', b.logo_url,
    'is_active', b.is_active,
    'hero_media', b.hero_media,
    'primary_color', b.primary_color,
    'about_ar', b.about_ar,
    'about_en', b.about_en,
    'meta_title', b.meta_title,
    'meta_description', b.meta_description
  ), b.id
  INTO v_brand, v_brand_id
  FROM public.brands b
  WHERE b.slug = p_brand_slug AND b.is_active = true
  LIMIT 1;

  IF v_brand IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Fetch brand_public_settings
  SELECT to_jsonb(s.*)
  INTO v_settings
  FROM public.brand_public_settings s
  WHERE s.brand_id = v_brand_id;

  -- 3. Fetch benefit settings
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_benefit
  FROM public.get_public_benefit_settings(v_brand_id) bs;

  -- 4. Fetch tracking settings
  SELECT jsonb_build_object(
    'google_analytics_enabled', ts.google_analytics_enabled,
    'google_analytics_id', ts.google_analytics_id,
    'meta_pixel_enabled', ts.meta_pixel_enabled,
    'meta_pixel_id', ts.meta_pixel_id,
    'consent_required', ts.consent_required
  )
  INTO v_tracking
  FROM public.brand_tracking_settings ts
  WHERE ts.brand_id = v_brand_id;

  -- 5. Fetch active products with variants
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'name_ar', p.name_ar,
      'name_en', p.name_en,
      'description', p.description,
      'description_ar', p.description_ar,
      'description_en', p.description_en,
      'category', p.category,
      'image_url', p.image_url,
      'media', p.media,
      'brand_id', p.brand_id,
      'created_at', p.created_at,
      'featured_trending', p.featured_trending,
      'show_sale_badge', p.show_sale_badge,
      'product_variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'selling_price', pv.selling_price,
          'original_price', pv.original_price,
          'stock_main', pv.stock_main,
          'size', pv.size,
          'color', pv.color
        ))
        FROM public.product_variants pv
        WHERE pv.product_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.products p
  WHERE p.brand_id = v_brand_id AND p.is_active = true;

  -- 6. Fetch active categories
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name_en', c.name_en,
      'name_ar', c.name_ar,
      'slug', c.slug,
      'image_url', c.image_url,
      'parent_id', c.parent_id,
      'sort_order', c.sort_order,
      'menu_icon_url', c.menu_icon_url
    ) ORDER BY c.sort_order ASC
  ), '[]'::jsonb)
  INTO v_categories
  FROM public.categories c
  WHERE c.brand_id = v_brand_id AND c.is_active = true;

  -- 7. Fetch best sellers
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_bestsellers
  FROM public.get_storefront_best_sellers(p_brand_slug, 8) bs;

  -- 8. Fetch trending
  SELECT COALESCE(jsonb_agg(to_jsonb(tr.*)), '[]'::jsonb)
  INTO v_trending
  FROM public.get_storefront_trending(p_brand_slug, 8) tr;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'settings', v_settings,
    'benefitSettings', v_benefit,
    'trackingSettings', v_tracking,
    'products', v_products,
    'categories', v_categories,
    'bestSellerRows', v_bestsellers,
    'trendingRows', v_trending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_page_data(text) TO anon, authenticated, service_role;
