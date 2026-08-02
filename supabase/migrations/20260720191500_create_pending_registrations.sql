-- Onboarding Pending Registrations and Dynamic Price Configuration
--

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  contact_number text NOT NULL,
  email text NOT NULL,
  subdomain text NOT NULL,
  plan_type text NOT NULL, -- 'trial' or 'paid'
  status text NOT NULL DEFAULT 'pending_manual_deployment',
  benefit_receipt_url text, -- R2 object key
  benefit_receipt_public_url text, -- resolved secure URL if needed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Allow public to insert registrations (since anybody can register their interest)
CREATE POLICY "Allow public insert to pending_registrations" 
  ON public.pending_registrations FOR INSERT 
  WITH CHECK (true);

-- Allow authenticated admins to select/update registrations
CREATE POLICY "Allow admin select/update to pending_registrations" 
  ON public.pending_registrations FOR ALL 
  TO authenticated
  USING (true);

-- Privileges
GRANT INSERT ON public.pending_registrations TO anon, authenticated;
GRANT SELECT ON public.pending_registrations TO anon, authenticated;
GRANT ALL ON public.pending_registrations TO service_role;

-- Dynamic price configurations RPC function
CREATE OR REPLACE FUNCTION public.get_onboarding_registration_price()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price text;
BEGIN
  SELECT value INTO v_price FROM public.app_config WHERE key = 'registration_price';
  IF v_price IS NULL THEN
    v_price := '55 BHD';
  END IF;
  RETURN v_price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_registration_price() TO anon, authenticated;

-- Insert default registration price if not already set
INSERT INTO public.app_config (key, value)
VALUES ('registration_price', '55 BHD')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
