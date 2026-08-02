-- Secure, tenant-scoped read access for the operational email activity log.
-- Message rows are written only by server-side email functions.

CREATE OR REPLACE FUNCTION public.list_brand_email_notifications(
  p_brand_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  invoice_number integer,
  event_type text,
  channel text,
  recipient text,
  provider text,
  status text,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.is_admin()
    OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    notification.id,
    notification.order_id,
    order_record.invoice_number,
    notification.event_type,
    notification.channel,
    notification.recipient,
    notification.provider,
    notification.status,
    notification.error_message,
    notification.created_at
  FROM public.brand_email_notifications AS notification
  LEFT JOIN public.orders AS order_record
    ON order_record.id = notification.order_id
    AND order_record.brand_id = notification.brand_id
  WHERE notification.brand_id = p_brand_id
  ORDER BY notification.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_brand_email_notifications(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_brand_email_notifications(uuid, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
