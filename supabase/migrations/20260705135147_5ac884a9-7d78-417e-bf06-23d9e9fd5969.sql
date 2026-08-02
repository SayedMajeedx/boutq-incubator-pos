
-- 1. customer_addresses table
CREATE TABLE public.customer_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label TEXT,
  region TEXT,
  road TEXT,
  house TEXT,
  flat TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own customer addresses"
  ON public.customer_addresses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX customer_addresses_customer_idx ON public.customer_addresses(customer_id);
CREATE UNIQUE INDEX customer_addresses_one_default_per_customer
  ON public.customer_addresses(customer_id)
  WHERE is_default;

CREATE TRIGGER customer_addresses_set_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. orders.shipping_address_id
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL;

-- 3. Backfill: for every customer with any structured address, create a default customer_addresses row
INSERT INTO public.customer_addresses (user_id, customer_id, region, road, house, flat, is_default, label)
SELECT c.user_id, c.id, c.region, c.road, c.house, c.flat, true, 'Primary'
FROM public.customers c
WHERE COALESCE(NULLIF(TRIM(c.region), ''), NULLIF(TRIM(c.road), ''), NULLIF(TRIM(c.house), ''), NULLIF(TRIM(c.flat), '')) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_addresses ca WHERE ca.customer_id = c.id
  );
