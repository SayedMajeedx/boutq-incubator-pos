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

  -- Delete dependent commerce records first. All statements run in this one
  -- transaction: any failure rolls the entire database purge back.
  FOREACH v_table IN ARRAY ARRAY[
    'customer_addresses', 'order_items', 'product_engagement_daily',
    'customization_options', 'product_variants', 'orders', 'products', 'customers'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE brand_id = $1', v_table) USING p_brand_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted_rows := v_deleted_rows + v_count;
    END IF;
  END LOOP;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DELETE FROM public.profiles WHERE brand_id = p_brand_id AND role <> 'super_admin';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_rows := v_deleted_rows + v_count;
    UPDATE public.profiles SET brand_id = NULL WHERE brand_id = p_brand_id AND role = 'super_admin';
  END IF;

  -- Purge every remaining public tenant table, including settings, branches,
  -- categories, expenses, logs, integrations, templates and brand profiles.
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'brand_id'
      AND c.table_name <> 'brands'
      AND c.table_name <> 'profiles'
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
