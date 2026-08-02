-- Correct the production enqueue signature used by automate_order_email_events.
-- The prior corrective migration accidentally created a different overload,
-- leaving the already-applied legacy function body in place.

DROP FUNCTION IF EXISTS public.enqueue_order_email_event(uuid, text, text);

CREATE OR REPLACE FUNCTION public.enqueue_order_email_event(
  p_order_id uuid,
  p_brand_id uuid,
  p_event_type text
)
RETURNS void
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

REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM authenticated;

-- Compatibility shim for any cached legacy caller. Delivery is intentionally
-- owned by the authenticated scheduled Worker, so this function does no I/O.
CREATE OR REPLACE FUNCTION public.dispatch_order_email_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_order_email_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_order_email_event(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_order_email_event(uuid) FROM authenticated;
