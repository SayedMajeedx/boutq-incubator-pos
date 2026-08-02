DROP POLICY IF EXISTS "Public can read active categories" ON public.categories;
CREATE POLICY "Public can read active categories"
  ON public.categories
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.brands b
      WHERE b.id = categories.brand_id AND b.is_active
    )
  );