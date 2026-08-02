-- Preserve the contact details used for each transaction and prevent an
-- anonymous checkout from mutating or claiming an authenticated customer.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_email_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_phone_snapshot text;

UPDATE public.orders o
SET
  customer_name_snapshot = COALESCE(o.customer_name_snapshot, c.name),
  customer_email_snapshot = COALESCE(o.customer_email_snapshot, c.email),
  customer_phone_snapshot = COALESCE(o.customer_phone_snapshot, c.phone)
FROM public.customers c
WHERE c.id = o.customer_id
  AND (
    o.customer_name_snapshot IS NULL
    OR o.customer_email_snapshot IS NULL
    OR o.customer_phone_snapshot IS NULL
  );

CREATE OR REPLACE FUNCTION public.preserve_order_contact_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.customer_name_snapshot IS NOT NULL THEN
    NEW.customer_name_snapshot := OLD.customer_name_snapshot;
  END IF;
  IF OLD.customer_email_snapshot IS NOT NULL THEN
    NEW.customer_email_snapshot := OLD.customer_email_snapshot;
  END IF;
  IF OLD.customer_phone_snapshot IS NOT NULL THEN
    NEW.customer_phone_snapshot := OLD.customer_phone_snapshot;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_order_contact_snapshot ON public.orders;
CREATE TRIGGER preserve_order_contact_snapshot
BEFORE UPDATE OF customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.preserve_order_contact_snapshot();

CREATE OR REPLACE FUNCTION public.place_storefront_order_core(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL,
  p_digital_contact text DEFAULT NULL,
  p_promo_code text DEFAULT NULL
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
  v_brand_id uuid;
  v_digital_enabled boolean;
  v_pickup_enabled boolean;
  v_order public.orders%ROWTYPE;
  v_promo jsonb;
  v_discount numeric(14,3) := 0;
  v_promo_id uuid;
  v_authoritative_items jsonb;
  v_phone text;
  v_email text;
  v_name text;
  v_matched_customer_id uuid;
  v_uid uuid;
  v_verified_email text;
  v_save_to_profile boolean;
BEGIN
  IF p_fulfillment NOT IN ('delivery', 'pickup', 'digital') THEN
    RAISE EXCEPTION 'INVALID_FULFILLMENT';
  END IF;

  SELECT b.id, COALESCE(bs.digital_delivery_enabled, false)
  INTO v_brand_id, v_digital_enabled
  FROM public.brands b
  LEFT JOIN public.business_settings bs ON bs.brand_id = b.id
  WHERE b.slug = p_brand_slug
    AND b.is_active = true;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND';
  END IF;

  IF p_fulfillment = 'digital' THEN
    IF NOT v_digital_enabled THEN RAISE EXCEPTION 'DIGITAL_DELIVERY_DISABLED'; END IF;
    IF p_digital_channel NOT IN ('email', 'whatsapp') THEN RAISE EXCEPTION 'INVALID_DIGITAL_CHANNEL'; END IF;
    IF NULLIF(trim(p_digital_contact), '') IS NULL THEN RAISE EXCEPTION 'DIGITAL_CONTACT_REQUIRED'; END IF;
    IF p_digital_channel = 'email'
       AND trim(p_digital_contact) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'INVALID_DIGITAL_EMAIL';
    END IF;
  ELSIF p_digital_channel IS NOT NULL OR p_digital_contact IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_DIGITAL_DETAILS';
  END IF;

  v_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_email := NULLIF(lower(trim(p_customer->>'email')), '');
  v_name := NULLIF(trim(p_customer->>'name'), '');
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT lower(email)
    INTO v_verified_email
    FROM auth.users
    WHERE id = v_uid
      AND email_confirmed_at IS NOT NULL;
  END IF;
  v_save_to_profile := v_uid IS NOT NULL
    AND COALESCE((p_customer->>'save_to_profile')::boolean, false);

  -- The internal order builder receives no authoritative contact identifiers.
  -- They are resolved below after it has safely created the transaction.
  v_safe_customer := COALESCE(p_customer, '{}'::jsonb)
    - 'phone' - 'email' - 'save_to_profile';

  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN item ? 'custom_field_values'
          THEN (item - 'custom_fields')
            || jsonb_build_object('custom_fields', item->'custom_field_values')
        ELSE item
      END
    ),
    '[]'::jsonb
  )
  INTO v_safe_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  IF p_fulfillment = 'digital' THEN
    SELECT pickup_enabled
    INTO v_pickup_enabled
    FROM public.business_settings
    WHERE brand_id = v_brand_id
    FOR UPDATE;

    UPDATE public.business_settings
    SET pickup_enabled = true
    WHERE brand_id = v_brand_id;

    v_result := public.place_storefront_order_internal_20260710(
      p_brand_slug, v_safe_customer, v_safe_items, p_payment_method,
      p_notes, 'pickup', NULL
    );

    UPDATE public.business_settings
    SET pickup_enabled = v_pickup_enabled
    WHERE brand_id = v_brand_id;

    UPDATE public.orders
    SET
      fulfillment_method = 'digital',
      branch_id = NULL,
      digital_delivery_channel = p_digital_channel,
      digital_delivery_contact = trim(p_digital_contact)
    WHERE id = (v_result->>'order_id')::uuid;
  ELSE
    v_result := public.place_storefront_order_internal_20260710(
      p_brand_slug, v_safe_customer, v_safe_items, p_payment_method,
      p_notes, p_fulfillment, p_branch_id
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = (v_result->>'order_id')::uuid
  FOR UPDATE;

  IF NULLIF(trim(p_promo_code), '') IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'variant_id', oi.variant_id,
        'line_total', oi.line_total
      )),
      '[]'::jsonb
    )
    INTO v_authoritative_items
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id;

    v_promo := public.validate_promo_code(
      p_brand_slug,
      p_promo_code,
      v_order.subtotal,
      v_authoritative_items,
      NULL
    );

    IF NOT COALESCE((v_promo->>'valid')::boolean, false) THEN
      RAISE EXCEPTION 'PROMO_%', COALESCE(v_promo->>'reason', 'INVALID');
    END IF;

    v_discount := (v_promo->>'discount_amount')::numeric;

    SELECT pc.id
    INTO v_promo_id
    FROM public.promo_codes pc
    WHERE pc.brand_id = v_brand_id
      AND upper(pc.code) = upper(trim(p_promo_code));

    UPDATE public.orders
    SET
      discount = v_discount,
      promo_code_id = v_promo_id,
      promo_code = upper(trim(p_promo_code)),
      total = greatest(0, subtotal - v_discount) + shipping + tax_amount
    WHERE id = v_order.id;
  END IF;

  SELECT customer_id, confirmation_email_token, invoice_number
  INTO v_customer_id, v_email_token, v_invoice_number
  FROM public.orders
  WHERE id = v_order.id;

  v_matched_customer_id := NULL;

  IF v_uid IS NOT NULL THEN
    -- A verified session is the only authority allowed to claim an account.
    SELECT id
    INTO v_matched_customer_id
    FROM public.customers
    WHERE brand_id = v_brand_id
      AND auth_user_id = v_uid
    LIMIT 1;
  ELSE
    -- Anonymous checkouts may only reuse anonymous CRM rows.
    IF v_email IS NOT NULL THEN
      SELECT id
      INTO v_matched_customer_id
      FROM public.customers
      WHERE brand_id = v_brand_id
        AND auth_user_id IS NULL
        AND lower(email) = v_email
      LIMIT 1;
    END IF;

    IF v_matched_customer_id IS NULL AND v_phone IS NOT NULL THEN
      SELECT id
      INTO v_matched_customer_id
      FROM public.customers
      WHERE brand_id = v_brand_id
        AND auth_user_id IS NULL
        AND regexp_replace(phone, '\D', '', 'g')
          = regexp_replace(v_phone, '\D', '', 'g')
        AND (v_email IS NULL OR email IS NULL OR lower(email) = v_email)
      LIMIT 1;
    END IF;
  END IF;

  IF v_matched_customer_id IS NOT NULL
     AND v_matched_customer_id <> v_customer_id THEN
    UPDATE public.customer_addresses
    SET
      customer_id = v_matched_customer_id,
      is_default = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.customer_addresses
          WHERE customer_id = v_matched_customer_id
            AND is_default
        ) THEN false
        ELSE is_default
      END
    WHERE customer_id = v_customer_id;

    UPDATE public.orders
    SET customer_id = v_matched_customer_id
    WHERE id = v_order.id;

    DELETE FROM public.customers
    WHERE id = v_customer_id;

    v_customer_id := v_matched_customer_id;
  END IF;

  IF v_uid IS NULL THEN
    -- Guest CRM rows may follow the latest guest-supplied contact details.
    UPDATE public.customers
    SET
      name = COALESCE(v_name, name),
      phone = COALESCE(v_phone, phone),
      email = COALESCE(email, v_email)
    WHERE id = v_customer_id
      AND auth_user_id IS NULL;
  ELSIF v_save_to_profile THEN
    -- Account data changes only with an authenticated session and consent.
    UPDATE public.customers
    SET
      name = COALESCE(v_name, name),
      phone = COALESCE(v_phone, phone)
    WHERE id = v_customer_id
      AND auth_user_id = v_uid;
  END IF;

  UPDATE public.orders
  SET
    customer_name_snapshot = COALESCE(v_name, customer_name_snapshot),
    customer_email_snapshot = COALESCE(v_email, customer_email_snapshot),
    customer_phone_snapshot = COALESCE(v_phone, customer_phone_snapshot)
  WHERE id = v_order.id;

  -- Once identity is verified, prior anonymous orders may be claimed without
  -- rewriting any historical order snapshot.
  IF v_uid IS NOT NULL AND v_verified_email IS NOT NULL THEN
    -- Address ownership must move first because the order/address consistency
    -- trigger validates customer_id during the subsequent order update.
    UPDATE public.customer_addresses
    SET
      customer_id = v_customer_id,
      is_default = false
    WHERE customer_id IN (
      SELECT id
      FROM public.customers
      WHERE brand_id = v_brand_id
        AND id <> v_customer_id
        AND auth_user_id IS NULL
        AND lower(email) = v_verified_email
    );

    UPDATE public.orders
    SET customer_id = v_customer_id
    WHERE customer_id IN (
      SELECT id
      FROM public.customers
      WHERE brand_id = v_brand_id
        AND id <> v_customer_id
        AND auth_user_id IS NULL
        AND lower(email) = v_verified_email
    );

    DELETE FROM public.customers
    WHERE brand_id = v_brand_id
      AND id <> v_customer_id
      AND auth_user_id IS NULL
      AND lower(email) = v_verified_email;
  END IF;

  RETURN v_result || jsonb_build_object(
    'confirmation_email_token', v_email_token,
    'invoice_number', v_invoice_number,
    'promo_code', CASE
      WHEN v_discount > 0 THEN upper(trim(p_promo_code))
      ELSE NULL
    END,
    'discount', v_discount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_order_core(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_storefront_order_core(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
