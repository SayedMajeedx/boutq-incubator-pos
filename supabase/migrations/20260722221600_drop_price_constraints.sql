-- Safely drop any check constraints on products.base_price that prevent 0 value entries
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_base_price_check;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_base_price_positive;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_base_price;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS base_price_check;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS base_price_positive;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS check_products_base_price;

-- Safely drop any check constraints on product_variants.selling_price that prevent 0 value entries
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_selling_price_check;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS check_selling_price_positive;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS check_selling_price;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS selling_price_check;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS selling_price_positive;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS check_product_variants_selling_price;
