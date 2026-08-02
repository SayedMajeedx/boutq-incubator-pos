-- Move outbox delivery ownership to the authenticated Cloudflare Worker.
-- This corrective migration is intentionally separate because the original
-- outbox migration was already applied to the production database.

DROP FUNCTION IF EXISTS public.dispatch_order_email_event(uuid);
DROP FUNCTION IF EXISTS public.claim_order_email_event(uuid);

CREATE FUNCTION public.claim_order_email_event(p_event_id uuid)
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
  SET
    status = 'processing',
    attempts = attempts + 1,
    last_error = NULL
  WHERE id = p_event_id
    AND status IN ('pending', 'failed')
    AND attempts < 5
  RETURNING
    order_email_events.order_id,
    order_email_events.event_type,
    order_email_events.language;
$$;

REVOKE ALL ON FUNCTION public.claim_order_email_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_order_email_event(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_order_email_event(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_order_email_event(
  p_order_id uuid,
  p_event_type text,
  p_language text DEFAULT 'en'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_email_events (order_id, event_type, language)
  VALUES (p_order_id, p_event_type, COALESCE(NULLIF(p_language, ''), 'en'))
  ON CONFLICT (order_id, event_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, text, text) FROM authenticated;

-- Recover events that may have been left claimed by the legacy direct-dispatch
-- path. The Worker retry loop will pick them up on its next scheduled run.
UPDATE public.order_email_events
SET
  status = 'failed',
  last_error = COALESCE(last_error, 'Recovered during Worker retry migration'),
  processed_at = NULL
WHERE status = 'processing';
