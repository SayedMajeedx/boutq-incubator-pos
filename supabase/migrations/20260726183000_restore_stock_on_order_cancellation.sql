-- Restore location-aware stock whenever a deducted order is cancelled.
-- Also repairs the legacy-key compatibility change that accidentally updated
-- the aggregate `stock` column instead of the source location columns.

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
  v_variant_id uuid;
  v_location text;
  v_available int;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_deducting := v_order.status IN ('confirmed', 'paid', 'shipped', 'completed');

  IF v_order.stock_deducted AND v_order.stock_snapshot IS NOT NULL THEN
    FOR v_key, v_value IN SELECT * FROM jsonb_each_text(v_order.stock_snapshot)
    LOOP
      IF position('|' in v_key) > 0 THEN
        v_variant_id := split_part(v_key, '|', 1)::uuid;
        v_location := split_part(v_key, '|', 2);
      ELSE
        v_variant_id := v_key::uuid;
        v_location := 'main';
      END IF;

      IF v_location = 'incubator' THEN
        UPDATE public.product_variants
        SET stock_incubator = stock_incubator + v_value::int
        WHERE id = v_variant_id;
      ELSE
        UPDATE public.product_variants
        SET stock_main = stock_main + v_value::int
        WHERE id = v_variant_id;
      END IF;
    END LOOP;

    UPDATE public.orders
    SET stock_deducted = false,
        stock_snapshot = NULL
    WHERE id = p_order_id;
  END IF;

  IF v_deducting THEN
    v_snapshot := '{}'::jsonb;

    FOR r IN
      SELECT
        variant_id,
        COALESCE(location, 'main') AS location,
        sum(quantity)::int AS quantity
      FROM public.order_items
      WHERE order_id = p_order_id
        AND variant_id IS NOT NULL
      GROUP BY variant_id, COALESCE(location, 'main')
    LOOP
      IF r.location = 'incubator' THEN
        SELECT stock_incubator INTO v_available
        FROM public.product_variants
        WHERE id = r.variant_id
        FOR UPDATE;
      ELSE
        SELECT stock_main INTO v_available
        FROM public.product_variants
        WHERE id = r.variant_id
        FOR UPDATE;
      END IF;

      IF v_available IS NULL OR v_available < r.quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', r.variant_id;
      END IF;

      IF r.location = 'incubator' THEN
        UPDATE public.product_variants
        SET stock_incubator = stock_incubator - r.quantity
        WHERE id = r.variant_id;
      ELSE
        UPDATE public.product_variants
        SET stock_main = stock_main - r.quantity
        WHERE id = r.variant_id;
      END IF;

      v_snapshot := v_snapshot || jsonb_build_object(
        r.variant_id::text || '|' || r.location,
        r.quantity
      );
    END LOOP;

    UPDATE public.orders
    SET stock_deducted = true,
        stock_snapshot = v_snapshot
    WHERE id = p_order_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_order_stock(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.restore_order_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_variant_id uuid;
  v_location text;
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND OLD.stock_deducted THEN
    IF OLD.stock_snapshot IS NOT NULL THEN
      FOR r IN SELECT key, value FROM jsonb_each_text(OLD.stock_snapshot)
      LOOP
        IF position('|' in r.key) > 0 THEN
          v_variant_id := split_part(r.key, '|', 1)::uuid;
          v_location := split_part(r.key, '|', 2);
        ELSE
          v_variant_id := r.key::uuid;
          v_location := 'main';
        END IF;

        IF v_location = 'incubator' THEN
          UPDATE public.product_variants
          SET stock_incubator = stock_incubator + r.value::int
          WHERE id = v_variant_id;
        ELSE
          UPDATE public.product_variants
          SET stock_main = stock_main + r.value::int
          WHERE id = v_variant_id;
        END IF;
      END LOOP;
    ELSE
      FOR r IN
        SELECT
          variant_id,
          COALESCE(location, 'main') AS location,
          sum(quantity)::int AS quantity
        FROM public.order_items
        WHERE order_id = OLD.id
          AND variant_id IS NOT NULL
        GROUP BY variant_id, COALESCE(location, 'main')
      LOOP
        IF r.location = 'incubator' THEN
          UPDATE public.product_variants
          SET stock_incubator = stock_incubator + r.quantity
          WHERE id = r.variant_id;
        ELSE
          UPDATE public.product_variants
          SET stock_main = stock_main + r.quantity
          WHERE id = r.variant_id;
        END IF;
      END LOOP;
    END IF;

    NEW.stock_deducted := false;
    NEW.stock_snapshot := NULL;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_order_stock_on_cancel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_stock_on_cancel() TO service_role;
DROP TRIGGER IF EXISTS trg_orders_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_orders_restore_stock_on_cancel
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.restore_order_stock_on_cancel();
-- Repair already-cancelled orders that still declare deducted stock. The
-- stock_deducted flag makes this repair idempotent.
DO $$
DECLARE
  v_order record;
  r record;
  v_variant_id uuid;
  v_location text;
BEGIN
  FOR v_order IN
    SELECT id, stock_snapshot
    FROM public.orders
    WHERE status = 'cancelled'
      AND stock_deducted = true
    FOR UPDATE
  LOOP
    IF v_order.stock_snapshot IS NOT NULL THEN
      FOR r IN SELECT key, value FROM jsonb_each_text(v_order.stock_snapshot)
      LOOP
        IF position('|' in r.key) > 0 THEN
          v_variant_id := split_part(r.key, '|', 1)::uuid;
          v_location := split_part(r.key, '|', 2);
        ELSE
          v_variant_id := r.key::uuid;
          v_location := 'main';
        END IF;

        IF v_location = 'incubator' THEN
          UPDATE public.product_variants
          SET stock_incubator = stock_incubator + r.value::int
          WHERE id = v_variant_id;
        ELSE
          UPDATE public.product_variants
          SET stock_main = stock_main + r.value::int
          WHERE id = v_variant_id;
        END IF;
      END LOOP;
    ELSE
      FOR r IN
        SELECT
          variant_id,
          COALESCE(location, 'main') AS location,
          sum(quantity)::int AS quantity
        FROM public.order_items
        WHERE order_id = v_order.id
          AND variant_id IS NOT NULL
        GROUP BY variant_id, COALESCE(location, 'main')
      LOOP
        IF r.location = 'incubator' THEN
          UPDATE public.product_variants
          SET stock_incubator = stock_incubator + r.quantity
          WHERE id = r.variant_id;
        ELSE
          UPDATE public.product_variants
          SET stock_main = stock_main + r.quantity
          WHERE id = r.variant_id;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.orders
    SET stock_deducted = false,
        stock_snapshot = NULL
    WHERE id = v_order.id;
  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';
