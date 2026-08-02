-- Persist storefront custom fields reliably and allocate invoice numbers
-- atomically within each brand.

ALTER TABLE public.order_items
  ALTER COLUMN custom_field_values SET DEFAULT '[]'::jsonb;

UPDATE public.order_items
SET custom_field_values = '[]'::jsonb
WHERE custom_field_values IS NULL
   OR (jsonb_typeof(custom_field_values) = 'object' AND custom_field_values = '{}'::jsonb);

-- Safely renumber only later duplicates before adding tenant-scoped uniqueness.
WITH ranked AS (
  SELECT id, brand_id, invoice_number,
         row_number() OVER (
           PARTITION BY brand_id, invoice_number ORDER BY created_at, id
         ) AS duplicate_rank
  FROM public.orders
), duplicates AS (
  SELECT id, brand_id,
         row_number() OVER (PARTITION BY brand_id ORDER BY invoice_number, id) AS offset_no
  FROM ranked
  WHERE duplicate_rank > 1
), brand_max AS (
  SELECT brand_id, COALESCE(max(invoice_number), 1000) AS max_invoice
  FROM public.orders
  GROUP BY brand_id
)
UPDATE public.orders o
SET invoice_number = bm.max_invoice + d.offset_no
FROM duplicates d
JOIN brand_max bm ON bm.brand_id = d.brand_id
WHERE o.id = d.id;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_user_id_invoice_number_key;
DROP INDEX IF EXISTS public.orders_user_id_invoice_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS orders_brand_id_invoice_number_key
  ON public.orders(brand_id, invoice_number);

-- Serialize all invoice allocation per brand, covering storefront checkout,
-- manual admin orders, and future insert paths.
CREATE OR REPLACE FUNCTION public.allocate_brand_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_invoice integer;
  v_next_setting integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.brand_id::text, 0));

  SELECT COALESCE(max(invoice_number), 1000)
    INTO v_last_invoice
    FROM public.orders
    WHERE brand_id = NEW.brand_id;

  SELECT next_invoice_number
    INTO v_next_setting
    FROM public.business_settings
    WHERE brand_id = NEW.brand_id
    FOR UPDATE;

  -- Existing storefront RPCs advance the setting immediately before INSERT;
  -- admin inserts do not. `next - 1` safely handles both paths without gaps.
  NEW.invoice_number := GREATEST(
    v_last_invoice + 1,
    COALESCE(v_next_setting - 1, 1001)
  );

  UPDATE public.business_settings
  SET next_invoice_number = GREATEST(next_invoice_number, NEW.invoice_number + 1)
  WHERE brand_id = NEW.brand_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocate_brand_invoice_number ON public.orders;
CREATE TRIGGER trg_allocate_brand_invoice_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.allocate_brand_invoice_number();

REVOKE ALL ON FUNCTION public.allocate_brand_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_brand_invoice_number() TO service_role;

-- Normalize either custom-field payload name before calling the security-
-- hardened internal checkout function. Return the number actually allocated
-- by the trigger rather than a stale pre-insert setting value.
CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_customer_id uuid;
  v_email_token uuid;
  v_invoice_number integer;
  v_safe_customer jsonb;
  v_safe_items jsonb;
BEGIN
  v_safe_customer := COALESCE(p_customer, '{}'::jsonb) - 'phone' - 'email';

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN item ? 'custom_field_values' THEN
        (item - 'custom_fields') || jsonb_build_object('custom_fields', item->'custom_field_values')
      ELSE item
    END
  ), '[]'::jsonb)
  INTO v_safe_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  v_result := public.place_storefront_order_internal_20260710(
    p_brand_slug, v_safe_customer, v_safe_items, p_payment_method,
    p_notes, p_fulfillment, p_branch_id
  );

  SELECT customer_id, confirmation_email_token, invoice_number
    INTO v_customer_id, v_email_token, v_invoice_number
    FROM public.orders
    WHERE id = (v_result->>'order_id')::uuid;

  UPDATE public.customers SET
    phone = NULLIF(trim(p_customer->>'phone'), ''),
    email = NULLIF(trim(p_customer->>'email'), '')
  WHERE id = v_customer_id;

  RETURN v_result || jsonb_build_object(
    'confirmation_email_token', v_email_token,
    'invoice_number', v_invoice_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid)
  TO anon, authenticated;
