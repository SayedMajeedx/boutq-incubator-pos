-- Migration: Add support for 5-axis hybrid product variants (option_four and option_five)

-- 1. Extend products with custom translation labels for option_four and option_five
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_label_four_ar text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_four_en text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_five_ar text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_five_en text DEFAULT NULL;

-- 2. Extend product_variants with the option values themselves
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS option_four text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS option_five text DEFAULT NULL;

-- 3. Expose new custom labels to anonymous and authenticated users for storefront queries
GRANT SELECT (
  variant_label_four_ar,
  variant_label_four_en,
  variant_label_five_ar,
  variant_label_five_en
) ON public.products TO anon, authenticated;

-- Force schema reload to update PostgREST metadata caches
NOTIFY pgrst, 'reload schema';
