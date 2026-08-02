-- Migration: Add missing order email status tracking columns to orders table

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_status text DEFAULT 'pending';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_error text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
