CREATE POLICY "brand admin update own brand"
  ON public.brands
  FOR UPDATE
  TO authenticated
  USING (is_brand_admin() AND id = current_brand_id())
  WITH CHECK (is_brand_admin() AND id = current_brand_id());