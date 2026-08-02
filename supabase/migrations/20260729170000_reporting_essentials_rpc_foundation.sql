-- Reporting Essentials: canonical, tenant-safe RPC foundation.
-- All monetary calculations use the order currency and BHD-safe numeric precision.

CREATE OR REPLACE FUNCTION public.reporting_brand_id(p_brand_slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_brand_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile.id IS NULL OR v_profile.status <> 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'Denied: view_financials permission required';
  END IF;

  IF v_profile.role = 'super_admin' AND NULLIF(btrim(p_brand_slug), '') IS NOT NULL THEN
    SELECT id INTO v_brand_id
    FROM public.brands
    WHERE lower(slug) = lower(btrim(p_brand_slug))
      AND is_active = true
    LIMIT 1;
  ELSE
    v_brand_id := v_profile.brand_id;
  END IF;

  IF v_brand_id IS NULL OR NOT (
    v_profile.role = 'super_admin' OR public.can_access_brand(v_brand_id)
  ) THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  RETURN v_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_brand_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporting_brand_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_reporting_overview(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH paid_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = v_brand_id
      AND o.created_at >= p_start_date
      AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
      AND lower(o.status) NOT IN ('cancelled', 'canceled')
  ),
  order_costs AS (
    SELECT
      o.id AS order_id,
      COALESCE(SUM(CASE WHEN oi.variant_id IS NOT NULL AND COALESCE(pv.cost_price, 0) > 0
        THEN oi.quantity * pv.cost_price ELSE 0 END), 0)::numeric AS known_cogs,
      COALESCE(SUM(CASE WHEN oi.variant_id IS NULL OR COALESCE(pv.cost_price, 0) <= 0
        THEN oi.quantity ELSE 0 END), 0)::bigint AS missing_cost_item_count,
      COALESCE(SUM(CASE WHEN oi.variant_id IS NULL OR COALESCE(pv.cost_price, 0) <= 0
        THEN oi.line_total ELSE 0 END), 0)::numeric AS missing_cost_exposure
    FROM paid_orders o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    GROUP BY o.id
  ),
  order_metrics AS (
    SELECT
      o.currency,
      COUNT(*)::bigint AS paid_order_count,
      COALESCE(SUM(o.total), 0)::numeric AS paid_order_value,
      COALESCE(SUM(o.subtotal - o.discount), 0)::numeric AS net_merch_sales,
      COALESCE(SUM(o.discount), 0)::numeric AS discounts,
      COALESCE(SUM(o.shipping), 0)::numeric AS shipping_collected,
      COALESCE(SUM(o.tax_amount), 0)::numeric AS vat_collected,
      COALESCE(SUM(CASE WHEN lower(o.payment_status) = 'partial' THEN o.advance_paid ELSE 0 END), 0)::numeric AS partial_amount,
      COALESCE(SUM(CASE WHEN lower(o.payment_status) = 'refunded' THEN o.total ELSE 0 END), 0)::numeric AS refunded_total,
      COUNT(*) FILTER (WHERE o.total = 0)::bigint AS free_completed_order_count,
      COALESCE(SUM(c.known_cogs), 0)::numeric AS known_cogs,
      COALESCE(SUM(c.missing_cost_item_count), 0)::bigint AS missing_cost_item_count,
      COALESCE(SUM(c.missing_cost_exposure), 0)::numeric AS missing_cost_exposure
    FROM paid_orders o
    LEFT JOIN order_costs c ON c.order_id = o.id
    GROUP BY o.currency
  ),
  currencies AS (
    SELECT currency FROM order_metrics
    UNION
    SELECT currency FROM public.expenses
    WHERE brand_id = v_brand_id
      AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
      AND expense_date < (p_end_date AT TIME ZONE p_tz)::date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency', c.currency,
    'paid_order_count', COALESCE(m.paid_order_count, 0),
    'paid_order_value', COALESCE(m.paid_order_value, 0),
    'net_merch_sales', COALESCE(m.net_merch_sales, 0),
    'discounts', COALESCE(m.discounts, 0),
    'shipping_collected', COALESCE(m.shipping_collected, 0),
    'vat_collected', COALESCE(m.vat_collected, 0),
    'partial_amount', COALESCE(m.partial_amount, 0),
    'refunded_total', COALESCE(m.refunded_total, 0),
    'free_completed_order_count', COALESCE(m.free_completed_order_count, 0),
    'known_cogs', COALESCE(m.known_cogs, 0),
    'missing_cost_item_count', COALESCE(m.missing_cost_item_count, 0),
    'missing_cost_exposure', COALESCE(m.missing_cost_exposure, 0),
    'expenses', COALESCE((
      SELECT SUM(e.amount) FROM public.expenses e
      WHERE e.brand_id = v_brand_id AND e.currency = c.currency
        AND e.expense_date >= (p_start_date AT TIME ZONE p_tz)::date
        AND e.expense_date < (p_end_date AT TIME ZONE p_tz)::date
    ), 0)
  ) ORDER BY c.currency), '[]'::jsonb)
  INTO v_result
  FROM currencies c
  LEFT JOIN order_metrics m USING (currency);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_sales(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_interval text DEFAULT 'day',
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_trunc text;
  v_result jsonb;
BEGIN
  IF p_interval NOT IN ('day', 'week', 'month', 'year') THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  v_trunc := p_interval;
  WITH paid_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = v_brand_id
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
      AND lower(o.status) NOT IN ('cancelled', 'canceled')
  ),
  timeseries AS (
    SELECT date_trunc(v_trunc, o.created_at AT TIME ZONE p_tz) AS time_bucket,
      o.currency, COUNT(*)::bigint AS paid_order_count,
      SUM(o.total)::numeric AS pov,
      SUM(o.subtotal - o.discount)::numeric AS net_merch,
      SUM(o.discount)::numeric AS discounts,
      SUM(o.shipping)::numeric AS shipping_collected,
      SUM(o.tax_amount)::numeric AS vat_collected
    FROM paid_orders o GROUP BY 1, o.currency
  ),
  payment AS (
    SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS payment_method,
      o.currency, COUNT(*)::bigint AS order_count, SUM(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  ),
  fulfillment AS (
    SELECT COALESCE(NULLIF(o.fulfillment_method, ''), 'unknown') AS fulfillment_method,
      o.currency, COUNT(*)::bigint AS order_count, SUM(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  )
  SELECT jsonb_build_object(
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.time_bucket, t.currency) FROM timeseries t), '[]'::jsonb),
    'payment_methods', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.pov DESC) FROM payment p), '[]'::jsonb),
    'fulfillment_methods', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.pov DESC) FROM fulfillment f), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_products_inventory(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort_by text DEFAULT 'units_sold_desc',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN RAISE EXCEPTION 'INVALID_PAGINATION'; END IF;
  IF p_sort_by NOT IN ('units_sold_desc', 'net_merch_desc') THEN RAISE EXCEPTION 'INVALID_SORT'; END IF;
  WITH rows AS (
    SELECT
      COALESCE(p.name, oi.description) AS product_name,
      pv.sku,
      o.currency,
      SUM(oi.quantity)::bigint AS units_sold,
      SUM(oi.line_total)::numeric AS net_merch_sales,
      SUM(CASE WHEN oi.variant_id IS NOT NULL AND COALESCE(pv.cost_price, 0) > 0 THEN oi.quantity * pv.cost_price ELSE 0 END)::numeric AS known_cogs,
      BOOL_OR(oi.variant_id IS NULL OR COALESCE(pv.cost_price, 0) <= 0) AS is_missing_cost,
      COALESCE(pv.stock_main, pv.stock, 0)::integer AS current_stock,
      COALESCE(pv.stock_main, pv.stock, 0) <= 0 AS is_out_of_stock,
      COALESCE(pv.stock_main, pv.stock, 0) BETWEEN 1 AND 5 AS is_low_stock
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.products p ON p.id = oi.product_id AND p.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    WHERE o.brand_id = v_brand_id
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
      AND lower(o.status) NOT IN ('cancelled', 'canceled')
    GROUP BY p.id, p.name, oi.description, pv.id, pv.sku, pv.stock_main, pv.stock, o.currency
  ), paged AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort_by = 'units_sold_desc' THEN units_sold END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'net_merch_desc' THEN net_merch_sales END DESC NULLS LAST,
      product_name
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb) INTO v_result FROM paged;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_customers(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH lifetime_first AS (
    SELECT customer_id, MIN(created_at) AS first_paid_at
    FROM public.orders
    WHERE brand_id = v_brand_id AND customer_id IS NOT NULL
      AND lower(COALESCE(payment_status, '')) = 'paid'
      AND lower(status) NOT IN ('cancelled', 'canceled')
    GROUP BY customer_id
  ),
  period_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = v_brand_id AND o.customer_id IS NOT NULL
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
      AND lower(o.status) NOT IN ('cancelled', 'canceled')
  ),
  counts AS (
    SELECT
      COUNT(DISTINCT po.customer_id) FILTER (WHERE lf.first_paid_at >= p_start_date)::bigint AS new_count,
      COUNT(DISTINCT po.customer_id) FILTER (WHERE lf.first_paid_at < p_start_date)::bigint AS returning_count
    FROM period_orders po JOIN lifetime_first lf USING (customer_id)
  ),
  top_customers AS (
    SELECT c.id AS customer_id, c.name AS customer_name, po.currency,
      COUNT(*)::bigint AS paid_order_count, SUM(po.total)::numeric AS total_pov
    FROM period_orders po JOIN public.customers c ON c.id = po.customer_id AND c.brand_id = v_brand_id
    GROUP BY c.id, c.name, po.currency
    ORDER BY total_pov DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'new_customers_count', COALESCE((SELECT new_count FROM counts), 0),
    'returning_customers_count', COALESCE((SELECT returning_count FROM counts), 0),
    'top_customers', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM top_customers t), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_expenses(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC)
    FROM (
      SELECT category, currency, COUNT(*)::bigint AS expense_count, SUM(amount)::numeric AS amount
      FROM public.expenses
      WHERE brand_id = v_brand_id
        AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
        AND expense_date < (p_end_date AT TIME ZONE p_tz)::date
      GROUP BY category, currency
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_export(
  p_report_type text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  IF p_report_type = 'sales' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'invoice_number', o.invoice_number, 'order_date', o.order_date,
        'status', o.status, 'payment_status', o.payment_status,
        'payment_method', o.payment_method, 'fulfillment_method', o.fulfillment_method,
        'currency', o.currency, 'subtotal', o.subtotal, 'discount', o.discount,
        'shipping', o.shipping, 'tax_amount', o.tax_amount, 'total', o.total
      ) ORDER BY o.created_at DESC)
      FROM public.orders o
      WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
    ), '[]'::jsonb);
  ELSIF p_report_type = 'products' THEN
    RETURN public.rpc_reporting_products_inventory(p_start_date, p_end_date, p_tz, true, 200, 0, 'net_merch_desc', p_brand_slug);
  ELSIF p_report_type = 'customers' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.total_spent DESC)
      FROM (
        SELECT c.name AS customer_name, o.currency, COUNT(*)::bigint AS paid_order_count,
          SUM(o.total)::numeric AS total_spent, MAX(o.created_at) AS last_order_at
        FROM public.customers c
        JOIN public.orders o ON o.customer_id = c.id AND o.brand_id = v_brand_id
        WHERE c.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
          AND lower(COALESCE(o.payment_status, '')) = 'paid'
          AND lower(o.status) NOT IN ('cancelled', 'canceled')
        GROUP BY c.id, c.name, o.currency
      ) x
    ), '[]'::jsonb);
  END IF;
  RAISE EXCEPTION 'INVALID_REPORT_TYPE';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_overview(timestamptz,timestamptz,text,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reporting_sales(timestamptz,timestamptz,text,text,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reporting_products_inventory(timestamptz,timestamptz,text,boolean,integer,integer,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reporting_customers(timestamptz,timestamptz,text,boolean,integer,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reporting_expenses(timestamptz,timestamptz,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reporting_export(text,timestamptz,timestamptz,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_reporting_overview(timestamptz,timestamptz,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_sales(timestamptz,timestamptz,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_products_inventory(timestamptz,timestamptz,text,boolean,integer,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_customers(timestamptz,timestamptz,text,boolean,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_expenses(timestamptz,timestamptz,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_export(text,timestamptz,timestamptz,text,text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_reporting_orders_brand_created_paid
  ON public.orders (brand_id, created_at DESC, currency)
  WHERE lower(payment_status) = 'paid';
CREATE INDEX IF NOT EXISTS idx_reporting_order_items_brand_order
  ON public.order_items (brand_id, order_id);
CREATE INDEX IF NOT EXISTS idx_reporting_expenses_brand_date_currency
  ON public.expenses (brand_id, expense_date DESC, currency);

NOTIFY pgrst, 'reload schema';
