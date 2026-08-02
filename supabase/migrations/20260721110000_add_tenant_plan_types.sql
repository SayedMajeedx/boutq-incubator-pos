-- Migration to add plan_type and trial_ends_at columns to brands
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'lifetime';
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT null;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
