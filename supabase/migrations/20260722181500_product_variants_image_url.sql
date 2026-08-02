ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS image_url text;

GRANT SELECT (image_url) ON public.product_variants TO anon, authenticated;

COMMENT ON COLUMN public.product_variants.image_url IS
  'Optional URL for variant-specific picture, shown when selected on the storefront.';
