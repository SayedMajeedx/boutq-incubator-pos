-- Phase 1: Incubator POS Baseline Schema (Dual-Language Vendor, Barcodes, Contracts, Shift Control, RLS)

-- 1. Dual-Language Vendor Schema
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  vendor_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  default_commission_bps integer NOT NULL DEFAULT 1000 CHECK (default_commission_bps >= 0 AND default_commission_bps <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_brand_id ON public.vendors(brand_id);
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_code ON public.vendors(vendor_code);

CREATE TABLE IF NOT EXISTS public.vendor_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_members_vendor_user_unique UNIQUE (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_members_vendor_id ON public.vendor_members(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_members_user_id ON public.vendor_members(user_id);

-- Alter products table to add vendor_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products(vendor_id);


-- 2. Unique Barcode Schema
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_barcodes_brand_code_unique UNIQUE (brand_id, code)
);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_brand_code ON public.product_barcodes(brand_id, code);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_variant_id ON public.product_barcodes(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_vendor_id ON public.product_barcodes(vendor_id);


-- 3. Rent & Lease Contract Tables
CREATE TABLE IF NOT EXISTS public.vendor_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  rack_number text,
  monthly_rent numeric(10,3) NOT NULL DEFAULT 0.000,
  commission_bps integer NOT NULL DEFAULT 1000 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
  start_date date NOT NULL,
  end_date date NOT NULL,
  signature_png_url text,
  pdf_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_vendor_id ON public.vendor_contracts(vendor_id);

CREATE TABLE IF NOT EXISTS public.vendor_rent_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(10,3) NOT NULL DEFAULT 0.000,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'deducted_from_sales', 'overdue', 'cancelled')),
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_rent_invoices_vendor_id ON public.vendor_rent_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_rent_invoices_status ON public.vendor_rent_invoices(status);


-- 4. POS Shift Control Tables
CREATE TABLE IF NOT EXISTS public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_registers_brand_id ON public.pos_registers(brand_id);

CREATE TABLE IF NOT EXISTS public.pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.pos_registers(id) ON DELETE CASCADE,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_cash_float numeric(10,3) NOT NULL DEFAULT 0.000,
  expected_cash numeric(10,3),
  actual_cash numeric(10,3),
  cash_variance numeric(10,3),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reconciled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_register_id ON public.pos_shifts(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_status ON public.pos_shifts(status);


-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vendors_updated_at') THEN
    CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_product_barcodes_updated_at') THEN
    CREATE TRIGGER trg_product_barcodes_updated_at BEFORE UPDATE ON public.product_barcodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vendor_contracts_updated_at') THEN
    CREATE TRIGGER trg_vendor_contracts_updated_at BEFORE UPDATE ON public.vendor_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vendor_rent_invoices_updated_at') THEN
    CREATE TRIGGER trg_vendor_rent_invoices_updated_at BEFORE UPDATE ON public.vendor_rent_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pos_registers_updated_at') THEN
    CREATE TRIGGER trg_pos_registers_updated_at BEFORE UPDATE ON public.pos_registers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pos_shifts_updated_at') THEN
    CREATE TRIGGER trg_pos_shifts_updated_at BEFORE UPDATE ON public.pos_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;


-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_rent_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_registers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_shifts TO authenticated;

GRANT ALL ON public.vendors TO service_role;
GRANT ALL ON public.vendor_members TO service_role;
GRANT ALL ON public.product_barcodes TO service_role;
GRANT ALL ON public.vendor_contracts TO service_role;
GRANT ALL ON public.vendor_rent_invoices TO service_role;
GRANT ALL ON public.pos_registers TO service_role;
GRANT ALL ON public.pos_shifts TO service_role;


-- 5. RLS Security Policies & Helper Functions
CREATE OR REPLACE FUNCTION public.get_user_vendor_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vendor_id FROM public.vendor_members
  WHERE user_id = auth.uid() AND status = 'active';
$$;

-- Enable RLS on all Phase 1 tables
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_rent_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;

-- Vendors RLS Policies
DROP POLICY IF EXISTS "Managers full access vendors" ON public.vendors;
CREATE POLICY "Managers full access vendors" ON public.vendors
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Vendor members read own vendor" ON public.vendors;
CREATE POLICY "Vendor members read own vendor" ON public.vendors
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_user_vendor_ids()));

-- Vendor Members RLS Policies
DROP POLICY IF EXISTS "Managers full access vendor_members" ON public.vendor_members;
CREATE POLICY "Managers full access vendor_members" ON public.vendor_members
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Vendor members read own vendor_members" ON public.vendor_members;
CREATE POLICY "Vendor members read own vendor_members" ON public.vendor_members
  FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.get_user_vendor_ids()));

-- Product Barcodes RLS Policies
DROP POLICY IF EXISTS "Managers full access product_barcodes" ON public.product_barcodes;
CREATE POLICY "Managers full access product_barcodes" ON public.product_barcodes
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Vendor members read own product_barcodes" ON public.product_barcodes;
CREATE POLICY "Vendor members read own product_barcodes" ON public.product_barcodes
  FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.get_user_vendor_ids()));

-- Vendor Contracts RLS Policies
DROP POLICY IF EXISTS "Managers full access vendor_contracts" ON public.vendor_contracts;
CREATE POLICY "Managers full access vendor_contracts" ON public.vendor_contracts
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Vendor members read own vendor_contracts" ON public.vendor_contracts;
CREATE POLICY "Vendor members read own vendor_contracts" ON public.vendor_contracts
  FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.get_user_vendor_ids()));

-- Vendor Rent Invoices RLS Policies
DROP POLICY IF EXISTS "Managers full access vendor_rent_invoices" ON public.vendor_rent_invoices;
CREATE POLICY "Managers full access vendor_rent_invoices" ON public.vendor_rent_invoices
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Vendor members read own vendor_rent_invoices" ON public.vendor_rent_invoices;
CREATE POLICY "Vendor members read own vendor_rent_invoices" ON public.vendor_rent_invoices
  FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.get_user_vendor_ids()));

-- POS Registers RLS Policies
DROP POLICY IF EXISTS "Managers full access pos_registers" ON public.pos_registers;
CREATE POLICY "Managers full access pos_registers" ON public.pos_registers
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

-- POS Shifts RLS Policies
DROP POLICY IF EXISTS "Managers full access pos_shifts" ON public.pos_shifts;
CREATE POLICY "Managers full access pos_shifts" ON public.pos_shifts
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());
