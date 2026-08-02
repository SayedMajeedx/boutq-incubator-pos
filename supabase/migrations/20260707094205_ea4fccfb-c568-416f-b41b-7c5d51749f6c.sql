
-- ============================================================
-- 1. brands table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'),
  name_en text NOT NULL,
  name_ar text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. Extend role check to include brand_admin
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','admin','brand_admin','staff'));

-- ============================================================
-- 3. Helper functions (security definer, locked search_path)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_brand_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT brand_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_access_brand(_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (p.role = 'super_admin' OR p.brand_id = _brand_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_brand_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'brand_admin'
      AND status = 'active'
  );
$$;

-- Update is_admin() to include brand_admin (they administer within their brand)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','admin','brand_admin')
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_brand_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_brand_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_brand_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_brand_admin() TO authenticated;

-- ============================================================
-- 4. Seed the default "Pura" brand and backfill
-- ============================================================
INSERT INTO public.brands (slug, name_en, name_ar, is_active)
VALUES ('pura', 'Pura', 'بورا', true)
ON CONFLICT (slug) DO NOTHING;

-- Add brand_id to remaining tables
ALTER TABLE public.customer_addresses    ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
ALTER TABLE public.order_items           ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
ALTER TABLE public.customization_options ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);

-- FK for existing brand_id columns (safe if already present)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'activity_logs','business_settings','customers','expenses',
    'message_templates','orders','product_variants','products','profiles'
  ]) LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I_brand_id_fkey', t, t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)',
      t, t
    );
  END LOOP;
END $$;

-- Backfill everything to Pura
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.profiles              SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL AND role <> 'super_admin';

WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.products              SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.product_variants      SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.orders                SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.order_items           SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.customers             SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.customer_addresses    SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.expenses              SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.activity_logs         SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.message_templates     SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.business_settings     SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;
WITH pura AS (SELECT id FROM public.brands WHERE slug='pura')
UPDATE public.customization_options SET brand_id = (SELECT id FROM pura) WHERE brand_id IS NULL;

-- Enforce NOT NULL on tenant tables (profiles kept nullable for super admin)
ALTER TABLE public.products              ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.product_variants      ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.orders                ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.order_items           ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.customers             ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.customer_addresses    ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.expenses              ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.activity_logs         ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.message_templates     ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.business_settings     ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE public.customization_options ALTER COLUMN brand_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_brand              ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_brand      ON public.product_variants(brand_id);
CREATE INDEX IF NOT EXISTS idx_orders_brand                ON public.orders(brand_id);
CREATE INDEX IF NOT EXISTS idx_order_items_brand           ON public.order_items(brand_id);
CREATE INDEX IF NOT EXISTS idx_customers_brand             ON public.customers(brand_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_brand    ON public.customer_addresses(brand_id);
CREATE INDEX IF NOT EXISTS idx_expenses_brand              ON public.expenses(brand_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_brand         ON public.activity_logs(brand_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_brand     ON public.message_templates(brand_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_brand     ON public.business_settings(brand_id);
CREATE INDEX IF NOT EXISTS idx_customization_options_brand ON public.customization_options(brand_id);
CREATE INDEX IF NOT EXISTS idx_profiles_brand              ON public.profiles(brand_id);

-- ============================================================
-- 5. Auto-fill brand_id trigger for tenant tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.default_brand_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    NEW.brand_id := public.current_brand_id();
  END IF;
  IF NEW.brand_id IS NULL THEN
    RAISE EXCEPTION 'brand_id is required and no current brand set for caller';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_order_item_brand_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT brand_id INTO NEW.brand_id FROM public.orders WHERE id = NEW.order_id;
  END IF;
  IF NEW.brand_id IS NULL THEN
    NEW.brand_id := public.current_brand_id();
  END IF;
  IF NEW.brand_id IS NULL THEN
    RAISE EXCEPTION 'brand_id is required on order_items';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_customer_address_brand_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT brand_id INTO NEW.brand_id FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  IF NEW.brand_id IS NULL THEN
    NEW.brand_id := public.current_brand_id();
  END IF;
  IF NEW.brand_id IS NULL THEN
    RAISE EXCEPTION 'brand_id is required on customer_addresses';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','product_variants','orders','customers','expenses',
    'activity_logs','message_templates','business_settings','customization_options'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_default_brand ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_default_brand BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.default_brand_id()',
      t
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_order_items_default_brand ON public.order_items;
CREATE TRIGGER trg_order_items_default_brand
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.default_order_item_brand_id();

DROP TRIGGER IF EXISTS trg_customer_addresses_default_brand ON public.customer_addresses;
CREATE TRIGGER trg_customer_addresses_default_brand
  BEFORE INSERT ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.default_customer_address_brand_id();

-- ============================================================
-- 6. Brand-scoped RLS policies (drop legacy user_id-only)
-- ============================================================
-- brands
DROP POLICY IF EXISTS "brands read" ON public.brands;
DROP POLICY IF EXISTS "brands super admin write" ON public.brands;
CREATE POLICY "brands read" ON public.brands
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_brand_id());
CREATE POLICY "brands super admin write" ON public.brands
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Tenant tables: replace legacy policies with brand-scoped ALL policies
DO $$
DECLARE
  rec record;
  t text;
BEGIN
  FOR rec IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public' AND tablename IN (
      'products','product_variants','orders','order_items','customers',
      'customer_addresses','expenses','activity_logs','message_templates',
      'business_settings','customization_options'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
  END LOOP;

  FOR t IN SELECT unnest(ARRAY[
    'products','product_variants','orders','order_items','customers',
    'customer_addresses','expenses','activity_logs','message_templates',
    'business_settings','customization_options'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY "brand access" ON public.%1$I FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id))',
      t
    );
  END LOOP;
END $$;
