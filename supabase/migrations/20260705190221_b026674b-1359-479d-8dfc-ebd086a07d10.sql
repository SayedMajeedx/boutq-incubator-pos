-- Switch default currency across the app to BHD
ALTER TABLE public.business_settings ALTER COLUMN currency SET DEFAULT 'BHD';
ALTER TABLE public.orders ALTER COLUMN currency SET DEFAULT 'BHD';
ALTER TABLE public.expenses ALTER COLUMN currency SET DEFAULT 'BHD';

-- Migrate any legacy SAR rows to BHD
UPDATE public.business_settings SET currency = 'BHD' WHERE currency = 'SAR';
UPDATE public.orders SET currency = 'BHD' WHERE currency = 'SAR';
UPDATE public.expenses SET currency = 'BHD' WHERE currency = 'SAR';