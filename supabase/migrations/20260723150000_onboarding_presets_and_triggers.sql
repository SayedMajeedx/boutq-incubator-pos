-- 1. High-Speed, Presets-Aware Tenant Onboarding Function
CREATE OR REPLACE FUNCTION public.create_tenant_with_defaults(
  p_slug text,
  p_name_en text,
  p_name_ar text,
  p_primary_color text,
  p_owner_id uuid,
  p_business_type text DEFAULT 'Fashion'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brand_id uuid;
  v_cat_id uuid;
BEGIN
  p_slug := lower(trim(p_slug));

  -- 1. Insert Brand
  INSERT INTO public.brands (slug, name_en, name_ar, primary_color, created_by, business_type, is_active)
  VALUES (p_slug, p_name_en, p_name_ar, p_primary_color, p_owner_id, p_business_type, true)
  RETURNING id INTO v_brand_id;

  -- 2. Insert Default Settings based on business type
  INSERT INTO public.business_settings (
    brand_id, business_name, primary_color, background_color, text_color,
    currency, delivery_fee, cod_enabled, card_enabled, benefit_enabled,
    delivery_enabled, pickup_enabled, vat_inclusive, default_tax_rate
  ) VALUES (
    v_brand_id, p_name_en, p_primary_color, '#ffffff', '#1c1917',
    'BHD', 1.500, true, false, false, 
    CASE WHEN p_business_type = 'Digital store' THEN false ELSE true END, -- delivery_enabled
    true, -- pickup_enabled
    false, 10.0
  );

  -- 3. Insert Default Category based on business type
  IF p_business_type = 'Cafe / Restaurant' THEN
    INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
    VALUES (v_brand_id, 'Beverages', 'المشروبات', 'beverages')
    RETURNING id INTO v_cat_id;
  ELSIF p_business_type = 'Digital store' THEN
    INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
    VALUES (v_brand_id, 'Digital Assets', 'المنتجات الرقمية', 'digital-assets')
    RETURNING id INTO v_cat_id;
  ELSE
    INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
    VALUES (v_brand_id, 'New Arrivals', 'وصلنا حديثاً', 'new-arrivals')
    RETURNING id INTO v_cat_id;
  END IF;

  -- 4. Insert Default Welcome Page
  INSERT INTO public.brand_pages (brand_id, slug, title_en, title_ar, content_en, content_ar)
  VALUES (
    v_brand_id, 'about', 'About Us', 'من نحن',
    'Welcome to our store! We are dedicated to providing the highest quality products and shopping experiences.',
    'مرحباً بكم في متجرنا! نحن ملتزمون بتقديم أرقى المنتجات وأفضل تجارب التسوق.'
  );

  RETURN v_brand_id;
END;
$$;

-- 2. Database Trigger on tenant_requests status update to 'approved'
CREATE OR REPLACE FUNCTION public.handle_tenant_request_approved()
RETURNS trigger AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- If status changed to approved, automatically provision the brand
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Find or default the owner_id (e.g., from an existing profile or a system account)
    SELECT id INTO v_owner_id 
    FROM public.profiles 
    WHERE email = NEW.email 
    LIMIT 1;

    IF v_owner_id IS NULL THEN
      -- Default to first super_admin as fallback
      SELECT id INTO v_owner_id 
      FROM public.profiles 
      WHERE role = 'super_admin' 
      LIMIT 1;
    END IF;

    IF v_owner_id IS NULL THEN
      v_owner_id := '00000000-0000-0000-0000-000000000000';
    END IF;

    -- Invoke our onboarding seeding function!
    PERFORM public.create_tenant_with_defaults(
      NEW.desired_subdomain,
      NEW.full_name,
      NEW.full_name, -- Arabic fallback (or we can translate or use empty)
      '#800020',     -- Default primary burgundy color
      v_owner_id,
      COALESCE(NEW.business_type, 'Fashion')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_tenant_request_approved ON public.tenant_requests;
CREATE TRIGGER trg_tenant_request_approved
  AFTER UPDATE OF status ON public.tenant_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_tenant_request_approved();

NOTIFY pgrst, 'reload schema';
