-- Migration: Adds payment_gateway_reference column to orders to track external payment gateway transaction IDs (e.g. Tap Charge IDs).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway_reference text;

-- Reload schema notify
NOTIFY pgrst, 'reload schema';
