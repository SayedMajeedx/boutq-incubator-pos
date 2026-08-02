ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS btn_checkout_bg text,
  ADD COLUMN IF NOT EXISTS btn_checkout_fg text;