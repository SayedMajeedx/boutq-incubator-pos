-- Release-gate hardening: expose only storefront-safe catalog columns.
--
-- Earlier migrations correctly changed these tables to column-level grants, but
-- 20260708150705 later restored a table-wide SELECT grant on products. Brands
-- also retained its original table-wide anonymous grant. RLS restricted rows to
-- active storefront records, but table-wide privileges still exposed internal
-- owner UUIDs (products.user_id and brands.created_by).

REVOKE ALL ON TABLE public.products FROM anon;
GRANT SELECT (
  id,
  brand_id,
  name,
  name_ar,
  name_en,
  description,
  description_ar,
  description_en,
  category,
  image_url,
  media,
  is_active,
  base_price,
  custom_fields,
  created_at,
  updated_at,
  featured_trending,
  show_sale_badge
) ON TABLE public.products TO anon;

REVOKE ALL ON TABLE public.brands FROM anon;
GRANT SELECT (
  id,
  slug,
  name_en,
  name_ar,
  logo_url,
  is_active,
  hero_media,
  primary_color,
  about_ar,
  about_en
) ON TABLE public.brands TO anon;

-- Preserve authenticated tenant administration. RLS remains the authority for
-- which brand rows an authenticated user can access.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.brands TO authenticated;

-- Repair the hard-delete routine found by the production database linter. The
-- deployed routine treated the full table list as one identifier. Using an
-- explicit SELECT/unnest loop avoids PL/pgSQL FOREACH parsing differences.
CREATE OR REPLACE FUNCTION public.delete_brand(p_brand_id uuid, p_hard boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_table text;
  v_deleted_rows bigint := 0;
  v_count bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can delete a brand';
  END IF;

  SELECT slug INTO v_slug FROM public.brands WHERE id = p_brand_id FOR UPDATE;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  IF NOT p_hard THEN
    UPDATE public.brands
       SET is_active = false,
           slug = v_slug || '-deleted-' || extract(epoch from now())::bigint
     WHERE id = p_brand_id;
    RETURN jsonb_build_object('deleted', true, 'mode', 'soft');
  END IF;

  FOR v_table IN
    SELECT unnest(ARRAY[
      'customer_addresses', 'order_items', 'product_engagement_daily',
      'customization_options', 'product_variants', 'orders', 'products', 'customers'
    ]::text[])
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE brand_id = $1', v_table) USING p_brand_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted_rows := v_deleted_rows + v_count;
    END IF;
  END LOOP;

  DELETE FROM public.profiles WHERE brand_id = p_brand_id AND role <> 'super_admin';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_rows := v_deleted_rows + v_count;
  UPDATE public.profiles SET brand_id = NULL WHERE brand_id = p_brand_id AND role = 'super_admin';

  FOR v_table IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'brand_id'
       AND c.table_name NOT IN ('brands', 'profiles')
       AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE brand_id = $1', v_table) USING p_brand_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_rows := v_deleted_rows + v_count;
  END LOOP;

  DELETE FROM public.brands WHERE id = p_brand_id;
  RETURN jsonb_build_object('deleted', true, 'mode', 'hard', 'rows_purged', v_deleted_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_brand(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_brand(uuid, boolean) TO authenticated;

-- Silence the production PL/pgSQL type warning and make the snapshot restore
-- conversion explicit. jsonb_each_text returns text values, not integers.
CREATE OR REPLACE FUNCTION public.sync_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_deducting boolean;
  v_snapshot jsonb;
  r record;
  v_key text;
  v_value text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  v_deducting := v_order.status IN ('confirmed', 'paid', 'shipped', 'completed');

  IF v_order.stock_deducted AND v_order.stock_snapshot IS NOT NULL THEN
    FOR v_key, v_value IN SELECT * FROM jsonb_each_text(v_order.stock_snapshot)
    LOOP
      UPDATE public.product_variants
         SET stock = stock + v_value::int
       WHERE id = v_key::uuid;
    END LOOP;
    UPDATE public.orders
       SET stock_deducted = false, stock_snapshot = NULL
     WHERE id = p_order_id;
  END IF;

  IF v_deducting THEN
    v_snapshot := '{}'::jsonb;
    FOR r IN
      SELECT variant_id, sum(quantity)::int AS qty
        FROM public.order_items
       WHERE order_id = p_order_id AND variant_id IS NOT NULL
       GROUP BY variant_id
    LOOP
      PERFORM 1
        FROM public.product_variants
       WHERE id = r.variant_id AND stock >= r.qty
       FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', r.variant_id; END IF;

      UPDATE public.product_variants SET stock = stock - r.qty WHERE id = r.variant_id;
      v_snapshot := v_snapshot || jsonb_build_object(r.variant_id::text, r.qty);
    END LOOP;
    UPDATE public.orders
       SET stock_deducted = true, stock_snapshot = v_snapshot
     WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_order_stock(uuid) TO authenticated, service_role;
