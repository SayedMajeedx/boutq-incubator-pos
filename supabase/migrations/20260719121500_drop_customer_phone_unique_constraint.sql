-- Migration: Drop customer unique phone constraint to allow multiple customers to share the same mobile phone number
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_brand_normalized_phone_unique CASCADE;
DROP INDEX IF EXISTS public.customers_brand_normalized_phone_unique CASCADE;

-- Just in case there is any other phone unique constraint
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_key CASCADE;
DROP INDEX IF EXISTS public.customers_phone_key CASCADE;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_unique CASCADE;
DROP INDEX IF EXISTS public.customers_phone_unique CASCADE;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_normalized_phone_unique CASCADE;
DROP INDEX IF EXISTS public.customers_normalized_phone_unique CASCADE;

-- Also refresh postgrest schema
NOTIFY pgrst, 'reload schema';
