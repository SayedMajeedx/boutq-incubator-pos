-- Storefront identities are platform-wide in Supabase Auth, but access is
-- explicitly granted per brand through a linked customer record.

-- Preserve all historical orders/addresses while consolidating accidental
-- duplicate memberships created by concurrent or repeated linking requests.
CREATE TEMP TABLE duplicate_storefront_memberships ON COMMIT DROP AS
WITH ranked_memberships AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY brand_id, auth_user_id
      ORDER BY created_at, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY brand_id, auth_user_id
      ORDER BY created_at, id
    ) AS membership_rank
  FROM public.customers
  WHERE auth_user_id IS NOT NULL
)
SELECT id, keeper_id FROM ranked_memberships WHERE membership_rank > 1;

UPDATE public.orders AS order_row
SET customer_id = duplicate.keeper_id
FROM duplicate_storefront_memberships AS duplicate
WHERE order_row.customer_id = duplicate.id;

UPDATE public.customer_addresses AS address
SET customer_id = duplicate.keeper_id
FROM duplicate_storefront_memberships AS duplicate
WHERE address.customer_id = duplicate.id;

UPDATE public.customers AS customer
SET auth_user_id = NULL
FROM duplicate_storefront_memberships AS duplicate
WHERE customer.id = duplicate.id;

CREATE UNIQUE INDEX IF NOT EXISTS customers_brand_auth_user_unique
  ON public.customers (brand_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.has_storefront_membership(p_brand_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.brands AS brand
    JOIN public.customers AS customer ON customer.brand_id = brand.id
    WHERE brand.slug = lower(trim(p_brand_slug))
      AND brand.is_active = true
      AND customer.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.activate_storefront_membership(
  p_brand_slug text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  linked_customer jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- The hardened linker validates the verified email, active brand, and only
  -- links/creates a customer inside the requested brand.
  SELECT public.link_storefront_customer(p_brand_slug, p_name, p_phone)
  INTO linked_customer;

  RETURN linked_customer;
END;
$$;

REVOKE ALL ON FUNCTION public.has_storefront_membership(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_storefront_membership(text) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_storefront_membership(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_storefront_membership(text, text, text) TO authenticated;
