-- Allow the authenticated AI variant parser to use its own isolated quota.
CREATE OR REPLACE FUNCTION public.consume_api_quota(
  p_action text, p_limit integer, p_window_minutes integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_action NOT IN ('receipt_scan', 'translation', 'variant_generation')
     OR p_limit < 1 OR p_limit > 1000
     OR p_window_minutes < 1 OR p_window_minutes > 1440 THEN
    RAISE EXCEPTION 'INVALID_QUOTA';
  END IF;
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / (p_window_minutes * 60)) * (p_window_minutes * 60)
  );
  INSERT INTO public.api_quota_usage(user_id, action, window_start, request_count)
  VALUES (v_uid, p_action, v_window, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET request_count = public.api_quota_usage.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_quota(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_api_quota(text, integer, integer) TO authenticated;
