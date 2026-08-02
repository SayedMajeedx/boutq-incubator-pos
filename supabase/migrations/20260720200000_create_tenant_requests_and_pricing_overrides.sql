-- Tenant Requests Queue and System Settings Pricing Overrides
--

CREATE TABLE IF NOT EXISTS public.tenant_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  contact_number text NOT NULL,
  desired_subdomain text NOT NULL,
  request_type text NOT NULL, -- 'trial' or 'paid'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  payment_verified boolean NOT NULL DEFAULT false,
  benefit_receipt_url text, -- stores the private R2 object key of uploaded screenshot
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies for tenant_requests
CREATE POLICY "Allow public insert to tenant_requests" 
  ON public.tenant_requests FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow public select to tenant_requests"
  ON public.tenant_requests FOR SELECT
  USING (true); -- needed for frontend subdomain availability check

CREATE POLICY "Allow admin all to tenant_requests"
  ON public.tenant_requests FOR ALL
  TO authenticated
  USING (true);

-- Policies for system_settings
CREATE POLICY "Allow public select to system_settings"
  ON public.system_settings FOR SELECT
  USING (true); -- needed by the onboarding view to fetch price

CREATE POLICY "Allow admin all to system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (true);

-- Privileges
GRANT INSERT, SELECT ON public.tenant_requests TO anon, authenticated;
GRANT ALL ON public.tenant_requests TO service_role;

GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- Seed default onboarding registration price
INSERT INTO public.system_settings (key, value)
VALUES ('onboarding_registration_price', '55 BHD')
ON CONFLICT (key) DO NOTHING;

-- RPC helper to fetch dynamic price safely bypassing any direct RLS restrictions
CREATE OR REPLACE FUNCTION public.get_onboarding_active_price()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price text;
BEGIN
  SELECT value INTO v_price FROM public.system_settings WHERE key = 'onboarding_registration_price';
  IF v_price IS NULL THEN
    v_price := '55 BHD';
  END IF;
  RETURN v_price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_active_price() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
