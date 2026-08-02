-- Encrypt tenant integration secrets with Supabase Vault and align reporting
-- add-ons with the same paid-order rules used by the operational dashboards.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS api_key_secret_id uuid,
  ADD COLUMN IF NOT EXISTS webhook_secret_secret_id uuid;

DO $$
DECLARE
  credential record;
  secret_id uuid;
BEGIN
  FOR credential IN
    SELECT id, brand_id, provider, api_key, webhook_secret
    FROM public.integration_credentials
  LOOP
    IF NULLIF(btrim(credential.api_key), '') IS NOT NULL THEN
      SELECT vault.create_secret(
        credential.api_key,
        'integration-api-' || credential.id::text,
        'Encrypted API credential for ' || credential.provider
      ) INTO secret_id;
      UPDATE public.integration_credentials
      SET api_key_secret_id = secret_id, api_key = NULL
      WHERE id = credential.id;
    END IF;

    IF NULLIF(btrim(credential.webhook_secret), '') IS NOT NULL THEN
      SELECT vault.create_secret(
        credential.webhook_secret,
        'integration-webhook-' || credential.id::text,
        'Encrypted webhook credential for ' || credential.provider
      ) INTO secret_id;
      UPDATE public.integration_credentials
      SET webhook_secret_secret_id = secret_id, webhook_secret = NULL
      WHERE id = credential.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_integration_credentials(p_brand_id uuid)
RETURNS TABLE(id uuid, brand_id uuid, provider text, base_url text,
  api_key_masked text, webhook_secret_masked text, has_api_key boolean,
  has_webhook_secret boolean, is_active boolean, notes text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT i.id, i.brand_id, i.provider, i.base_url,
    CASE WHEN api.decrypted_secret IS NULL THEN NULL
      ELSE left(api.decrypted_secret, 4) || '••••••' || right(api.decrypted_secret, 4) END,
    CASE WHEN webhook.decrypted_secret IS NULL THEN NULL
      ELSE left(webhook.decrypted_secret, 4) || '••••••' || right(webhook.decrypted_secret, 4) END,
    api.decrypted_secret IS NOT NULL,
    webhook.decrypted_secret IS NOT NULL,
    i.is_active, i.notes, i.updated_at
  FROM public.integration_credentials i
  LEFT JOIN vault.decrypted_secrets api ON api.id = i.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook ON webhook.id = i.webhook_secret_secret_id
  WHERE i.brand_id = p_brand_id
    AND public.is_admin() AND public.can_access_brand(p_brand_id)
  ORDER BY i.provider;
$$;

CREATE OR REPLACE FUNCTION public.save_integration_credential(
  p_id uuid, p_brand_id uuid, p_provider text, p_base_url text,
  p_api_key text, p_webhook_secret text, p_is_active boolean, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
  v_api_secret_id uuid;
  v_webhook_secret_id uuid;
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NULLIF(btrim(p_provider), '') IS NULL THEN RAISE EXCEPTION 'PROVIDER_REQUIRED'; END IF;

  IF p_id IS NULL THEN
    v_id := gen_random_uuid();
    IF NULLIF(btrim(p_api_key), '') IS NOT NULL THEN
      SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || v_id::text,
        'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
    END IF;
    IF NULLIF(btrim(p_webhook_secret), '') IS NOT NULL THEN
      SELECT vault.create_secret(btrim(p_webhook_secret), 'integration-webhook-' || v_id::text,
        'Encrypted webhook credential for ' || btrim(p_provider)) INTO v_webhook_secret_id;
    END IF;
    INSERT INTO public.integration_credentials(
      id, brand_id, provider, base_url, api_key_secret_id, webhook_secret_secret_id,
      is_active, notes, created_by
    ) VALUES (
      v_id, p_brand_id, btrim(p_provider), NULLIF(btrim(p_base_url), ''),
      v_api_secret_id, v_webhook_secret_id, COALESCE(p_is_active, true),
      NULLIF(btrim(p_notes), ''), auth.uid()
    );
  ELSE
    SELECT api_key_secret_id, webhook_secret_secret_id
      INTO v_api_secret_id, v_webhook_secret_id
    FROM public.integration_credentials
    WHERE id = p_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

    IF NULLIF(btrim(p_api_key), '') IS NOT NULL THEN
      IF v_api_secret_id IS NULL THEN
        SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || p_id::text,
          'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
      ELSE
        PERFORM vault.update_secret(v_api_secret_id, btrim(p_api_key));
      END IF;
    END IF;
    IF NULLIF(btrim(p_webhook_secret), '') IS NOT NULL THEN
      IF v_webhook_secret_id IS NULL THEN
        SELECT vault.create_secret(btrim(p_webhook_secret), 'integration-webhook-' || p_id::text,
          'Encrypted webhook credential for ' || btrim(p_provider)) INTO v_webhook_secret_id;
      ELSE
        PERFORM vault.update_secret(v_webhook_secret_id, btrim(p_webhook_secret));
      END IF;
    END IF;

    UPDATE public.integration_credentials
    SET provider = btrim(p_provider),
      base_url = NULLIF(btrim(p_base_url), ''),
      api_key_secret_id = v_api_secret_id,
      webhook_secret_secret_id = v_webhook_secret_id,
      api_key = NULL,
      webhook_secret = NULL,
      is_active = COALESCE(p_is_active, true),
      notes = NULLIF(btrim(p_notes), '')
    WHERE id = p_id AND brand_id = p_brand_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_integration_credential_secret(
  p_brand_id uuid,
  p_provider text
) RETURNS TABLE(base_url text, api_key text, webhook_secret text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT i.base_url, api.decrypted_secret, webhook.decrypted_secret, i.is_active
  FROM public.integration_credentials i
  LEFT JOIN vault.decrypted_secrets api ON api.id = i.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook ON webhook.id = i.webhook_secret_secret_id
  WHERE i.brand_id = p_brand_id AND i.provider = p_provider
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.delete_integration_credential(p_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_api_secret_id uuid;
  v_webhook_secret_id uuid;
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM public.integration_credentials
  WHERE id = p_id AND brand_id = p_brand_id
  RETURNING api_key_secret_id, webhook_secret_secret_id
  INTO v_api_secret_id, v_webhook_secret_id;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM vault.secrets
  WHERE id = v_api_secret_id OR id = v_webhook_secret_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_integration_credential_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_integration_credential_secret(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_reporting_processing_fees(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY result.currency), '[]'::jsonb)
  FROM (
    SELECT o.currency,
      COALESCE(SUM(CASE
        WHEN lower(COALESCE(o.payment_method, '')) = 'card'
          THEN o.total * COALESCE(bs.card_processing_fee, 0) / 100
        WHEN lower(COALESCE(o.payment_method, '')) IN ('benefit', 'benefitpay', 'benefit_pay')
          THEN o.total * COALESCE(bs.benefit_processing_fee, 0) / 100
        ELSE 0 END), 0)::numeric AS processing_fees
    FROM public.orders o
    JOIN public.business_settings bs ON bs.brand_id = o.brand_id
    WHERE o.brand_id = public.reporting_brand_id(p_brand_slug)
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
    GROUP BY o.currency
  ) result;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_processing_fees(timestamptz,timestamptz,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_processing_fees(timestamptz,timestamptz,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_reporting_products_inventory(
  p_start_date timestamptz, p_end_date timestamptz, p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false, p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'units_sold_desc',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug); v_result jsonb;
BEGIN
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN RAISE EXCEPTION 'INVALID_PAGINATION'; END IF;
  IF p_sort_by NOT IN ('units_sold_desc', 'net_merch_desc') THEN RAISE EXCEPTION 'INVALID_SORT'; END IF;
  WITH rows AS (
    SELECT COALESCE(p.name, oi.description) AS product_name, pv.id AS variant_id,
      pv.sku, pv.size, pv.color, pv.fabric, o.currency,
      SUM(oi.quantity)::bigint AS units_sold, SUM(oi.line_total)::numeric AS net_merch_sales,
      SUM(CASE WHEN oi.variant_id IS NOT NULL AND COALESCE(pv.cost_price, 0) > 0
        THEN oi.quantity * pv.cost_price ELSE 0 END)::numeric AS known_cogs,
      BOOL_OR(oi.variant_id IS NULL OR COALESCE(pv.cost_price, 0) <= 0) AS is_missing_cost,
      COALESCE(pv.stock_main, pv.stock, 0)::integer AS current_stock,
      COALESCE(pv.stock_main, pv.stock, 0) <= 0 AS is_out_of_stock,
      COALESCE(pv.stock_main, pv.stock, 0) BETWEEN 1 AND 5 AS is_low_stock
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.products p ON p.id = oi.product_id AND p.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
      AND lower(o.status) NOT IN ('cancelled', 'canceled')
    GROUP BY p.id, p.name, oi.description, pv.id, pv.sku, pv.size, pv.color, pv.fabric,
      pv.stock_main, pv.stock, o.currency
  ), paged AS (
    SELECT * FROM rows ORDER BY
      CASE WHEN p_sort_by = 'units_sold_desc' THEN units_sold END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'net_merch_desc' THEN net_merch_sales END DESC NULLS LAST,
      product_name, size, color, fabric
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb) INTO v_result FROM paged;
  RETURN v_result;
END;
$$;
