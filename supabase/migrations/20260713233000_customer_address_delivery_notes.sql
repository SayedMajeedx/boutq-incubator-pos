ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS delivery_notes text;

