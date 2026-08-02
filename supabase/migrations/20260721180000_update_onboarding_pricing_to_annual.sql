-- Update system_settings column defaults for Annual Subscription model
ALTER TABLE public.system_settings 
  ALTER COLUMN base_price_bhd SET DEFAULT 59.00,
  ALTER COLUMN discount_price_bhd SET DEFAULT 49.00;

-- Update the active singleton configuration row to use our new pricing values
INSERT INTO public.system_settings (id, base_price_bhd, discount_price_bhd, updated_at)
VALUES (1, 59.00, 49.00, now())
ON CONFLICT (id) DO UPDATE SET
  base_price_bhd = EXCLUDED.base_price_bhd,
  discount_price_bhd = EXCLUDED.discount_price_bhd,
  updated_at = EXCLUDED.updated_at;

-- Notify postgrest to reload cache
NOTIFY pgrst, 'reload schema';
