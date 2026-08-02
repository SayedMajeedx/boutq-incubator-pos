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
      DECLARE
        v_variant_id uuid;
      BEGIN
        IF position('|' in v_key) > 0 THEN
          v_variant_id := split_part(v_key, '|', 1)::uuid;
        ELSE
          v_variant_id := v_key::uuid;
        END IF;

        UPDATE public.product_variants
           SET stock = stock + v_value::int
         WHERE id = v_variant_id;
      END;
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
