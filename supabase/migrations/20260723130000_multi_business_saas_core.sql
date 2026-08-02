-- Migration: Registers multi-business SaaS core schemas, profiles custom permissions column, and self-escalation safeguards.

-- 1. Inventory tracking flag on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tracks_inventory boolean DEFAULT true;

-- 2. Business type fields for Onboarding
ALTER TABLE public.tenant_requests ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS business_type text;

-- 3. Granular profiles permissions column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '[]'::jsonb;

-- 4. Re-issue "Users can update own profile" policy with permissions self-escalation safeguard
-- Drop first to prevent duplicates
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  AND brand_id IS NOT DISTINCT FROM (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
  AND permissions IS NOT DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = auth.uid())
);

-- 5. Permission checker secure function (Hardened with standard jsonb_exists)
CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active' -- Guard: Deactivated staff are auto-blocked standalone
      AND (
        role IN ('admin', 'super_admin', 'brand_admin')
        OR jsonb_exists(permissions, p_permission)
      )
  );
END;
$$;

-- Secure Execution Access
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;


-- 6. Add permission checks to existing table policies by dropping "brand access"
-- Drop and replace on public.expenses (Full read/write financial restriction)
DROP POLICY IF EXISTS "brand access" ON public.expenses;
CREATE POLICY "brand access with permission check" ON public.expenses
  FOR ALL TO authenticated
  USING (
    public.can_access_brand(brand_id) AND public.has_permission('view_financials')
  )
  WITH CHECK (
    public.can_access_brand(brand_id) AND public.has_permission('view_financials')
  );

-- Drop and replace on public.business_settings (Split: All staff select, authorized write only)
DROP POLICY IF EXISTS "brand access" ON public.business_settings;

CREATE POLICY "brand read settings" ON public.business_settings
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

CREATE POLICY "brand insert settings" ON public.business_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

CREATE POLICY "brand update settings" ON public.business_settings
  FOR UPDATE TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

CREATE POLICY "brand delete settings" ON public.business_settings
  FOR DELETE TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));


-- 7. Backfill permissions for existing staff based on current access
UPDATE public.profiles
SET permissions = '["manage_inventory", "manage_orders", "manage_customers"]'::jsonb
WHERE role = 'staff' AND (permissions IS NULL OR permissions = '[]'::jsonb);

UPDATE public.profiles
SET permissions = '["manage_inventory", "manage_orders", "manage_customers", "view_financials", "manage_settings"]'::jsonb
WHERE role IN ('admin', 'brand_admin', 'super_admin') AND (permissions IS NULL OR permissions = '[]'::jsonb);

-- Courier profiles are deliberately excluded from this backfill to maintain their decoupled workflow.

NOTIFY pgrst, 'reload schema';
