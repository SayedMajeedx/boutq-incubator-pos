-- Dedicated courier access: assigned delivery orders only.
-- This migration deliberately separates delivery progress from commercial order/payment state.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'brand_admin', 'staff', 'courier'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unassigned';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_notes text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (
  fulfillment_status IN (
    'unassigned', 'ready_for_delivery', 'assigned', 'out_for_delivery',
    'delivered', 'delivery_failed', 'returned'
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Couriers must not inherit the broad tenant access used by office staff.
CREATE OR REPLACE FUNCTION public.can_access_brand(_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role <> 'courier'
      AND (p.role = 'super_admin' OR p.brand_id = _brand_id)
  );
$$;

-- Replace the broad order policies with explicit office/courier policies.
DROP POLICY IF EXISTS "brand access" ON public.orders;
DROP POLICY IF EXISTS "office brand orders access" ON public.orders;
DROP POLICY IF EXISTS "courier assigned orders read" ON public.orders;
CREATE POLICY "office brand orders access" ON public.orders
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));
CREATE POLICY "courier assigned orders read" ON public.orders
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND fulfillment_method = 'delivery'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'courier' AND p.status = 'active'
        AND p.brand_id = orders.brand_id
    )
  );

DROP POLICY IF EXISTS "brand access" ON public.order_items;
DROP POLICY IF EXISTS "office brand order items access" ON public.order_items;
DROP POLICY IF EXISTS "courier assigned order items read" ON public.order_items;
CREATE POLICY "office brand order items access" ON public.order_items
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));
CREATE POLICY "courier assigned order items read" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
  ));

-- Only expose the customer attached to an assigned order. Other customers remain invisible.
DROP POLICY IF EXISTS "brand access" ON public.customers;
DROP POLICY IF EXISTS "office brand customers access" ON public.customers;
DROP POLICY IF EXISTS "courier assigned customer read" ON public.customers;
CREATE POLICY "office brand customers access" ON public.customers
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));
CREATE POLICY "courier assigned customer read" ON public.customers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.customer_id = customers.id AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
  ));

DROP POLICY IF EXISTS "brand access" ON public.customer_addresses;
DROP POLICY IF EXISTS "office brand customer addresses access" ON public.customer_addresses;
DROP POLICY IF EXISTS "courier assigned address read" ON public.customer_addresses;
CREATE POLICY "office brand customer addresses access" ON public.customer_addresses
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));
CREATE POLICY "courier assigned address read" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.shipping_address_id = customer_addresses.id AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
  ));

-- Admin-only assignment. Pickup and digital orders cannot be assigned to a courier.
CREATE OR REPLACE FUNCTION public.assign_order_courier(p_order_id uuid, p_courier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_courier public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.fulfillment_method <> 'delivery' THEN RAISE EXCEPTION 'DELIVERY_ONLY'; END IF;

  IF p_courier_id IS NULL THEN
    UPDATE public.orders SET assigned_to = NULL, assigned_at = NULL, assigned_by = auth.uid(),
      fulfillment_status = 'unassigned' WHERE id = p_order_id;
    RETURN;
  END IF;

  SELECT * INTO v_courier FROM public.profiles WHERE id = p_courier_id;
  IF v_courier.id IS NULL OR v_courier.role <> 'courier' OR v_courier.status <> 'active'
     OR v_courier.brand_id IS DISTINCT FROM v_order.brand_id THEN
    RAISE EXCEPTION 'INVALID_COURIER';
  END IF;
  UPDATE public.orders SET assigned_to = p_courier_id, assigned_at = now(), assigned_by = auth.uid(),
    fulfillment_status = CASE WHEN fulfillment_status = 'unassigned' THEN 'assigned' ELSE fulfillment_status END
  WHERE id = p_order_id;
END;
$$;

-- Couriers can change only delivery workflow fields on their own assigned order.
CREATE OR REPLACE FUNCTION public.courier_update_delivery(
  p_order_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF p_status NOT IN ('out_for_delivery', 'delivered', 'delivery_failed', 'returned') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_STATUS';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.assigned_to IS DISTINCT FROM auth.uid()
     OR v_order.fulfillment_method <> 'delivery' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = 'courier' AND p.status = 'active' AND p.brand_id = v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.orders SET fulfillment_status = p_status,
    delivery_notes = NULLIF(btrim(p_notes), ''),
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_courier(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.courier_update_delivery(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_order_courier(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_update_delivery(uuid, text, text) TO authenticated;
