
-- Restore stock automatically when an order is deleted
CREATE OR REPLACE FUNCTION public.orders_restore_stock_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF OLD.stock_deducted THEN
    FOR r IN
      SELECT variant_id, SUM(quantity)::int AS qty
      FROM public.order_items
      WHERE order_id = OLD.id AND variant_id IS NOT NULL
      GROUP BY variant_id
    LOOP
      UPDATE public.product_variants
        SET stock = stock + r.qty
      WHERE id = r.variant_id;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg ON public.orders;
CREATE TRIGGER orders_restore_stock_on_delete_trg
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_restore_stock_on_delete();

-- Make sync_order_stock idempotent: reconcile against a snapshot stored in orders.stock_snapshot.
-- If already deducted, restore previously-deducted quantities, then re-deduct current items when still in a deducting state.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_snapshot jsonb;

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
  r RECORD;
  key text;
  val int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  v_deducting := v_order.status IN ('confirmed','paid','shipped','completed');

  -- 1) Restore any previously-deducted quantities from snapshot
  IF v_order.stock_deducted AND v_order.stock_snapshot IS NOT NULL THEN
    FOR key, val IN SELECT * FROM jsonb_each_text(v_order.stock_snapshot) LOOP
      UPDATE public.product_variants
        SET stock = stock + val::int
      WHERE id = key::uuid;
    END LOOP;
    UPDATE public.orders SET stock_deducted = false, stock_snapshot = NULL WHERE id = p_order_id;
  END IF;

  -- 2) If order is in a deducting state, deduct current items and snapshot them
  IF v_deducting THEN
    v_snapshot := '{}'::jsonb;
    FOR r IN
      SELECT variant_id, SUM(quantity)::int AS qty
      FROM public.order_items
      WHERE order_id = p_order_id AND variant_id IS NOT NULL
      GROUP BY variant_id
    LOOP
      PERFORM 1 FROM public.product_variants WHERE id = r.variant_id AND stock >= r.qty FOR UPDATE;
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
