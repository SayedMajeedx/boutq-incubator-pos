
-- 1) Theme columns on business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS logo_align text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS header_bg text,
  ADD COLUMN IF NOT EXISTS header_fg text,
  ADD COLUMN IF NOT EXISTS footer_bg text,
  ADD COLUMN IF NOT EXISTS footer_fg text,
  ADD COLUMN IF NOT EXISTS heading_color text,
  ADD COLUMN IF NOT EXISTS link_color text,
  ADD COLUMN IF NOT EXISTS btn_primary_bg text,
  ADD COLUMN IF NOT EXISTS btn_primary_fg text,
  ADD COLUMN IF NOT EXISTS btn_secondary_bg text,
  ADD COLUMN IF NOT EXISTS btn_secondary_fg text;

-- Expose new columns to anon on the storefront view
GRANT SELECT (logo_align, header_bg, header_fg, footer_bg, footer_fg,
              heading_color, link_color,
              btn_primary_bg, btn_primary_fg, btn_secondary_bg, btn_secondary_fg)
  ON public.business_settings TO anon;

CREATE OR REPLACE VIEW public.brand_public_settings AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency,
       bs.primary_color, bs.text_color, bs.background_color,
       bs.font_family, bs.font_url,
       bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url,
       bs.footer_note,
       bs.delivery_fee, bs.pickup_enabled, bs.delivery_enabled,
       bs.logo_size, bs.logo_align,
       bs.header_bg, bs.header_fg, bs.footer_bg, bs.footer_fg,
       bs.heading_color, bs.link_color,
       bs.btn_primary_bg, bs.btn_primary_fg,
       bs.btn_secondary_bg, bs.btn_secondary_fg
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- 2) Auto-provision business_settings when a new brand is created
CREATE OR REPLACE FUNCTION public.ensure_business_settings_for_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  v_owner := COALESCE(NEW.created_by, auth.uid());
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.business_settings (
    user_id, brand_id, business_name, logo_url, currency, primary_color,
    text_color, background_color, cod_enabled, card_enabled, benefit_enabled,
    delivery_enabled, pickup_enabled
  ) VALUES (
    v_owner, NEW.id,
    COALESCE(NEW.name_en, 'My Store'),
    NEW.logo_url,
    'BHD',
    COALESCE(NEW.primary_color, '#8b6f47'),
    '#111111', '#ffffff',
    true, false, false,
    true, true
  ) ON CONFLICT (brand_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

-- Ensure uniqueness so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS business_settings_brand_id_key
  ON public.business_settings(brand_id);

DROP TRIGGER IF EXISTS brands_after_insert_default_settings ON public.brands;
CREATE TRIGGER brands_after_insert_default_settings
  AFTER INSERT ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.ensure_business_settings_for_brand();

REVOKE EXECUTE ON FUNCTION public.ensure_business_settings_for_brand() FROM PUBLIC, anon;

-- Backfill for existing brands
INSERT INTO public.business_settings (
  user_id, brand_id, business_name, logo_url, currency, primary_color,
  text_color, background_color, cod_enabled, card_enabled, benefit_enabled,
  delivery_enabled, pickup_enabled
)
SELECT COALESCE(b.created_by, (SELECT id FROM public.profiles WHERE role='super_admin' LIMIT 1)),
       b.id, COALESCE(b.name_en,'My Store'), b.logo_url, 'BHD',
       COALESCE(b.primary_color,'#8b6f47'), '#111111','#ffffff',
       true,false,false,true,true
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.business_settings s WHERE s.brand_id = b.id)
  AND COALESCE(b.created_by, (SELECT id FROM public.profiles WHERE role='super_admin' LIMIT 1)) IS NOT NULL;

-- 3) Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text,
  slug text,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_brand_slug_key
  ON public.categories(brand_id, slug) WHERE slug IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
GRANT SELECT (id, brand_id, name_en, name_ar, slug, image_url, sort_order, is_active)
  ON public.categories TO anon;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage brand categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin() AND public.can_access_brand(brand_id))
  WITH CHECK (public.is_admin() AND public.can_access_brand(brand_id));

CREATE POLICY "Public can read active categories"
  ON public.categories FOR SELECT TO anon
  USING (is_active = true);

DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) delete_category helper
CREATE OR REPLACE FUNCTION public.delete_category(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand uuid;
  v_slug text;
  v_name text;
  v_count int;
BEGIN
  SELECT brand_id, slug, name_en INTO v_brand, v_slug, v_name
    FROM public.categories WHERE id = p_id;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;
  IF NOT (public.is_admin() AND public.can_access_brand(v_brand)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.products
    WHERE brand_id = v_brand
      AND (category = v_slug OR category = v_name);

  IF v_count > 0 THEN
    UPDATE public.categories SET is_active = false WHERE id = p_id;
    RETURN jsonb_build_object('deleted', true, 'mode', 'soft', 'linked_products', v_count);
  ELSE
    DELETE FROM public.categories WHERE id = p_id;
    RETURN jsonb_build_object('deleted', true, 'mode', 'hard', 'linked_products', 0);
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.delete_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_category(uuid) TO authenticated;
