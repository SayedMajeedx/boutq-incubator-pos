ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS original_price numeric(12,3);

ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_original_price_check;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_original_price_check
  CHECK (original_price IS NULL OR original_price >= 0);

GRANT SELECT (original_price) ON public.product_variants TO anon, authenticated;

COMMENT ON COLUMN public.product_variants.original_price IS
  'Optional pre-discount price. When greater than selling_price, storefronts show a discount.';
