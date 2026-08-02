ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS receipt_time text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,4);