-- Add courier_notified_at column to orders table to track when courier was notified via WhatsApp
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_notified_at timestamptz NULL;
