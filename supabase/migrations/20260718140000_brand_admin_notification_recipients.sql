-- Optional, brand-scoped recipients for SendPulse internal notifications.
-- Active brand admins remain the automatic default recipients; these rows add
-- carefully scoped recipients such as an owner, warehouse manager, or accountant.

CREATE TABLE IF NOT EXISTS public.brand_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  receive_order_placed boolean NOT NULL DEFAULT true,
  receive_benefit_payment_approved boolean NOT NULL DEFAULT true,
  receive_benefit_payment_rejected boolean NOT NULL DEFAULT true,
  receive_order_cancelled boolean NOT NULL DEFAULT true,
  receive_order_delivered boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_notification_recipients_email_format
    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_notification_recipients_brand_email_unique
  ON public.brand_notification_recipients (brand_id, lower(email));

CREATE OR REPLACE FUNCTION public.normalize_brand_notification_recipient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.name := NULLIF(trim(COALESCE(NEW.name, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_brand_notification_recipient ON public.brand_notification_recipients;
CREATE TRIGGER normalize_brand_notification_recipient
BEFORE INSERT OR UPDATE ON public.brand_notification_recipients
FOR EACH ROW EXECUTE FUNCTION public.normalize_brand_notification_recipient();

ALTER TABLE public.brand_notification_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand admins read notification recipients" ON public.brand_notification_recipients;
CREATE POLICY "Brand admins read notification recipients"
ON public.brand_notification_recipients FOR SELECT TO authenticated
USING (public.is_admin() AND public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "Brand admins manage notification recipients" ON public.brand_notification_recipients;
CREATE POLICY "Brand admins manage notification recipients"
ON public.brand_notification_recipients FOR ALL TO authenticated
USING (public.is_admin() AND public.can_access_brand(brand_id))
WITH CHECK (public.is_admin() AND public.can_access_brand(brand_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_notification_recipients TO authenticated;

NOTIFY pgrst, 'reload schema';
