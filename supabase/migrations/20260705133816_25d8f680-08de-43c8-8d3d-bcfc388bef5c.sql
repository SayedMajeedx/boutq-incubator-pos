ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS road text,
  ADD COLUMN IF NOT EXISTS house text,
  ADD COLUMN IF NOT EXISTS flat text;