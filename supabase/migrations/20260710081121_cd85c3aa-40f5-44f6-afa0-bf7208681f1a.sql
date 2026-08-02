ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS size_unit text;
GRANT SELECT (size_unit) ON public.product_variants TO anon;