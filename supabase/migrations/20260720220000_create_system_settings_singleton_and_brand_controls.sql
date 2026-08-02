-- Drop legacy key-value system settings
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- Create singleton system settings table
CREATE TABLE public.system_settings (
  id integer PRIMARY KEY CHECK (id = 1) DEFAULT 1,
  base_price_bhd numeric(10, 2) NOT NULL DEFAULT 55.00,
  discount_price_bhd numeric(10, 2) DEFAULT NULL,
  platform_icon_url text DEFAULT NULL,
  benefit_pay_qr_url text DEFAULT NULL,
  merchant_account_name text NOT NULL DEFAULT 'BOUTQ-OFFICIAL',
  whatsapp_support_number text NOT NULL DEFAULT '97339955508',
  superadmin_impersonation_mutation_allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow anyone (anon/authenticated) to read settings
CREATE POLICY "Allow public select to system_settings"
  ON public.system_settings FOR SELECT
  USING (true);

-- All privileges policy: Allow authenticated administrators (or superadmins) to edit/upsert settings
CREATE POLICY "Allow admin all to system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (true);

-- Grant appropriate permissions
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- Seed default singleton row
INSERT INTO public.system_settings (id, base_price_bhd, discount_price_bhd, platform_icon_url, benefit_pay_qr_url, merchant_account_name, whatsapp_support_number, superadmin_impersonation_mutation_allowed)
VALUES (1, 55.00, NULL, NULL, NULL, 'BOUTQ-OFFICIAL', '97339955508', false)
ON CONFLICT (id) DO NOTHING;

-- Recreate dynamic pricing function helper for backwards compatibility
CREATE OR REPLACE FUNCTION public.get_onboarding_active_price()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base numeric;
  v_disc numeric;
  v_price text;
BEGIN
  SELECT base_price_bhd, discount_price_bhd INTO v_base, v_disc 
  FROM public.system_settings 
  WHERE id = 1;
  
  IF v_disc IS NOT NULL THEN
    v_price := v_disc::text || ' BHD';
  ELSE
    v_price := COALESCE(v_base, 55.00)::text || ' BHD';
  END IF;
  
  RETURN v_price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_active_price() TO anon, authenticated;

-- Notify postgrest to reload schema cache
NOTIFY pgrst, 'reload schema';
