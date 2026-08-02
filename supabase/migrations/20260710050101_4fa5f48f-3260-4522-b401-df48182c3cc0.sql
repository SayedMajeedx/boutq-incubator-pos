
-- Fix profiles_self_update_role_brand_lock: restrict policy to authenticated role
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    AND NOT (brand_id IS DISTINCT FROM (SELECT brand_id FROM public.profiles WHERE id = auth.uid()))
  );

-- Fix customers_realtime_exposure: remove customers PII table from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
