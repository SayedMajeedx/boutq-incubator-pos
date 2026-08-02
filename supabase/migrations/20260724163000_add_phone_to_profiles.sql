-- Add phone column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text NULL;
