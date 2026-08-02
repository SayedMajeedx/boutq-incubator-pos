-- Optional proof document for manually entered expenses.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMENT ON COLUMN public.expenses.receipt_url IS
  'Public R2 URL for an optional image or PDF receipt attachment.';
