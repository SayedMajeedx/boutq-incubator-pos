-- Superadmin Impersonation Support Access & System Audit Logs
--

-- 1. Add support_access_enabled column to brands table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS support_access_enabled boolean NOT NULL DEFAULT true;

-- 2. Create system_audit_logs table to establish an unalterable history trail
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_tenant_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- e.g. 'impersonation_start', 'impersonation_end'
  reason text, -- optional metadata/reason
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for system_audit_logs
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for system_audit_logs
CREATE POLICY "Allow superadmin select system_audit_logs"
  ON public.system_audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Allow superadmin insert system_audit_logs"
  ON public.system_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Privileges
GRANT SELECT, INSERT ON public.system_audit_logs TO authenticated;
GRANT ALL ON public.system_audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';
