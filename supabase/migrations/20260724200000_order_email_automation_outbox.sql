-- Durable, database-owned email automation for the complete order lifecycle.
-- Browser code must never be responsible for business-critical notifications.

CREATE TABLE IF NOT EXISTS public.order_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'order_placed',
    'benefit_payment_approved',
    'benefit_payment_rejected',
    'order_delivered'
  )),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('ar', 'en')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (order_id, event_type)
);

CREATE INDEX IF NOT EXISTS order_email_events_pending_idx
  ON public.order_email_events (created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.order_email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_email_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_order_email_event(p_event_id uuid)
RETURNS TABLE (
  order_id uuid,
  event_type text,
  language text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.order_email_events
  SET status = 'processing',
      attempts = attempts + 1,
      last_error = NULL
  WHERE id = p_event_id
    AND status IN ('pending', 'failed')
    AND attempts < 5
  RETURNING order_email_events.order_id,
            order_email_events.event_type,
            order_email_events.language;
$$;

REVOKE ALL ON FUNCTION public.claim_order_email_event(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_order_email_event(
  p_order_id uuid,
  p_brand_id uuid,
  p_event_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_email_events (order_id, brand_id, event_type)
  VALUES (p_order_id, p_brand_id, p_event_type)
  ON CONFLICT (order_id, event_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.automate_order_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_placed');
    RETURN NEW;
  END IF;

  IF NEW.payment_method = 'benefit'
     AND NEW.payment_status = 'paid'
     AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'benefit_payment_approved');
  END IF;

  IF NEW.payment_method = 'benefit'
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'benefit_payment_rejected');
  END IF;

  IF (
    (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
    OR (
      lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
      AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
    )
  ) THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_delivered');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automate_order_email_events ON public.orders;
CREATE TRIGGER automate_order_email_events
AFTER INSERT OR UPDATE OF status, payment_status, fulfillment_status, benefit_receipt_rejected_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.automate_order_email_events();

REVOKE ALL ON FUNCTION public.automate_order_email_events() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.order_email_events IS
  'Durable outbox for automatic order lifecycle emails. Written by order triggers and processed by send-order-email.';
