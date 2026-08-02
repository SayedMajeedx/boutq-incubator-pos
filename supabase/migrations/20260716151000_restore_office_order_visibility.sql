-- Remove the orders <-> customers RLS recursion introduced by courier access.
-- Cross-table authorization is evaluated inside narrowly scoped SECURITY DEFINER
-- helpers so PostgreSQL does not recursively evaluate the referenced table's RLS.

CREATE OR REPLACE FUNCTION public.storefront_user_owns_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.storefront_user_owns_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.id = p_order_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.courier_can_read_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.customer_id = p_customer_id
      AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
      AND p.role = 'courier'
      AND p.status = 'active'
      AND p.brand_id = o.brand_id
  );
$$;

CREATE OR REPLACE FUNCTION public.courier_can_read_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = p_order_id
      AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
      AND p.role = 'courier'
      AND p.status = 'active'
      AND p.brand_id = o.brand_id
  );
$$;

CREATE OR REPLACE FUNCTION public.courier_can_read_address(
  p_address_id uuid,
  p_customer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE (o.shipping_address_id = p_address_id OR o.customer_id = p_customer_id)
      AND o.assigned_to = auth.uid()
      AND o.fulfillment_method = 'delivery'
      AND p.role = 'courier'
      AND p.status = 'active'
      AND p.brand_id = o.brand_id
  );
$$;

REVOKE ALL ON FUNCTION public.storefront_user_owns_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storefront_user_owns_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.courier_can_read_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.courier_can_read_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.courier_can_read_address(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_user_owns_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_user_owns_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_can_read_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_can_read_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_can_read_address(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "order self read" ON public.orders;
CREATE POLICY "order self read" ON public.orders
  FOR SELECT TO authenticated
  USING (public.storefront_user_owns_customer(customer_id));

DROP POLICY IF EXISTS "courier assigned customer read" ON public.customers;
CREATE POLICY "courier assigned customer read" ON public.customers
  FOR SELECT TO authenticated
  USING (public.courier_can_read_customer(id));

DROP POLICY IF EXISTS "order items self read" ON public.order_items;
CREATE POLICY "order items self read" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.storefront_user_owns_order(order_id));

DROP POLICY IF EXISTS "courier assigned order items read" ON public.order_items;
CREATE POLICY "courier assigned order items read" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.courier_can_read_order(order_id));

DROP POLICY IF EXISTS "courier assigned address read" ON public.customer_addresses;
CREATE POLICY "courier assigned address read" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (public.courier_can_read_address(id, customer_id));

NOTIFY pgrst, 'reload schema';
