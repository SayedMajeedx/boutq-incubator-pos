-- Security hardening: server API quotas, storefront order throttling, and
-- browser-safe integration credential access.

-- A profile owner may edit presentation fields such as name, but identity,
-- tenant, role and account state remain authoritative server-managed fields.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  AND brand_id IS NOT DISTINCT FROM (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.api_quota_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, window_start)
);
ALTER TABLE public.api_quota_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_quota_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_quota_usage TO service_role;

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
  IF p_action NOT IN ('receipt_scan', 'translation')
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

-- Limit successful unpaid storefront orders. This prevents automated guest
-- checkout from continuously draining available inventory.
CREATE OR REPLACE FUNCTION public.enforce_storefront_order_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_brand_count integer; v_customer_count integer;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_brand_count FROM public.orders
    WHERE brand_id = NEW.brand_id AND channel = 'storefront'
      AND created_at >= now() - interval '10 minutes';
  IF v_brand_count >= 50 THEN RAISE EXCEPTION 'STOREFRONT_RATE_LIMITED'; END IF;
  IF NEW.customer_id IS NOT NULL THEN
    SELECT count(*) INTO v_customer_count FROM public.orders
      WHERE brand_id = NEW.brand_id AND customer_id = NEW.customer_id
        AND channel = 'storefront' AND created_at >= now() - interval '1 hour';
    IF v_customer_count >= 5 THEN RAISE EXCEPTION 'CUSTOMER_ORDER_RATE_LIMITED'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_storefront_order_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_storefront_order_rate_limit ON public.orders;
CREATE TRIGGER trg_storefront_order_rate_limit
BEFORE INSERT ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.enforce_storefront_order_rate_limit();

-- Credentials remain server-side: browsers receive masked values only and
-- can replace a secret without ever reading the stored value back.
REVOKE ALL ON public.integration_credentials FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_integration_credentials(p_brand_id uuid)
RETURNS TABLE(id uuid, brand_id uuid, provider text, base_url text,
  api_key_masked text, webhook_secret_masked text, has_api_key boolean,
  has_webhook_secret boolean, is_active boolean, notes text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.brand_id, i.provider, i.base_url,
    CASE WHEN i.api_key IS NULL THEN NULL ELSE left(i.api_key, 4) || '••••••' || right(i.api_key, 4) END,
    CASE WHEN i.webhook_secret IS NULL THEN NULL ELSE left(i.webhook_secret, 4) || '••••••' || right(i.webhook_secret, 4) END,
    i.api_key IS NOT NULL, i.webhook_secret IS NOT NULL,
    i.is_active, i.notes, i.updated_at
  FROM public.integration_credentials i
  WHERE i.brand_id = p_brand_id
    AND public.is_admin() AND public.can_access_brand(p_brand_id)
  ORDER BY i.provider;
$$;

CREATE OR REPLACE FUNCTION public.save_integration_credential(
  p_id uuid, p_brand_id uuid, p_provider text, p_base_url text,
  p_api_key text, p_webhook_secret text, p_is_active boolean, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NULLIF(trim(p_provider), '') IS NULL THEN RAISE EXCEPTION 'PROVIDER_REQUIRED'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.integration_credentials(brand_id, provider, base_url, api_key, webhook_secret, is_active, notes, created_by)
    VALUES (p_brand_id, trim(p_provider), NULLIF(trim(p_base_url), ''), NULLIF(trim(p_api_key), ''),
      NULLIF(trim(p_webhook_secret), ''), COALESCE(p_is_active, true), NULLIF(trim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.integration_credentials SET provider = trim(p_provider), base_url = NULLIF(trim(p_base_url), ''),
      api_key = CASE WHEN NULLIF(trim(p_api_key), '') IS NULL THEN api_key ELSE trim(p_api_key) END,
      webhook_secret = CASE WHEN NULLIF(trim(p_webhook_secret), '') IS NULL THEN webhook_secret ELSE trim(p_webhook_secret) END,
      is_active = COALESCE(p_is_active, true), notes = NULLIF(trim(p_notes), '')
    WHERE id = p_id AND brand_id = p_brand_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_integration_credential(p_id uuid, p_brand_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.integration_credentials WHERE id = p_id AND brand_id = p_brand_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.list_integration_credentials(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_integration_credential(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_integration_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_integration_credential(uuid, uuid) TO authenticated;
