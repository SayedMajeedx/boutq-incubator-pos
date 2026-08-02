-- Migration: Safe Duplicate Phone Handling on Guest Checkout
-- Redefines place_storefront_order_core to catch unique_violation on phone numbers and fall back safely

CREATE OR REPLACE FUNCTION public.place_storefront_order_core(
  p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
  p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL, p_promo_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb; v_customer_id uuid; v_email_token uuid; v_invoice_number integer;
  v_safe_customer jsonb; v_safe_items jsonb; v_brand_id uuid;
  v_digital_enabled boolean; v_pickup_enabled boolean;
  v_order public.orders%ROWTYPE; v_promo jsonb; v_discount numeric(14,3) := 0; v_promo_id uuid;
  v_authoritative_items jsonb;
  
  -- Validation and resolution variables
  v_phone text;
  v_email text;
  v_matched_customer_id uuid;
  v_uid uuid;
BEGIN
  IF p_fulfillment NOT IN ('delivery', 'pickup', 'digital') THEN RAISE EXCEPTION 'INVALID_FULFILLMENT'; END IF;
  SELECT b.id, COALESCE(bs.digital_delivery_enabled, false) INTO v_brand_id, v_digital_enabled
  FROM public.brands b LEFT JOIN public.business_settings bs ON bs.brand_id = b.id
  WHERE b.slug = p_brand_slug AND b.is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  IF p_fulfillment = 'digital' THEN
    IF NOT v_digital_enabled THEN RAISE EXCEPTION 'DIGITAL_DELIVERY_DISABLED'; END IF;
    IF p_digital_channel NOT IN ('email', 'whatsapp') THEN RAISE EXCEPTION 'INVALID_DIGITAL_CHANNEL'; END IF;
    IF NULLIF(trim(p_digital_contact), '') IS NULL THEN RAISE EXCEPTION 'DIGITAL_CONTACT_REQUIRED'; END IF;
    IF p_digital_channel = 'email' AND trim(p_digital_contact) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'INVALID_DIGITAL_EMAIL'; END IF;
  ELSIF p_digital_channel IS NOT NULL OR p_digital_contact IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_DIGITAL_DETAILS';
  END IF;

  v_safe_customer := COALESCE(p_customer, '{}'::jsonb) - 'phone' - 'email';
  SELECT COALESCE(jsonb_agg(CASE WHEN item ? 'custom_field_values'
    THEN (item - 'custom_fields') || jsonb_build_object('custom_fields', item->'custom_field_values') ELSE item END), '[]'::jsonb)
  INTO v_safe_items FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  IF p_fulfillment = 'digital' THEN
    SELECT pickup_enabled INTO v_pickup_enabled FROM public.business_settings WHERE brand_id = v_brand_id FOR UPDATE;
    UPDATE public.business_settings SET pickup_enabled = true WHERE brand_id = v_brand_id;
    v_result := public.place_storefront_order_internal_20260710(p_brand_slug,v_safe_customer,v_safe_items,p_payment_method,p_notes,'pickup',NULL);
    UPDATE public.business_settings SET pickup_enabled = v_pickup_enabled WHERE brand_id = v_brand_id;
    UPDATE public.orders SET fulfillment_method='digital', branch_id=NULL,
      digital_delivery_channel=p_digital_channel, digital_delivery_contact=trim(p_digital_contact)
    WHERE id=(v_result->>'order_id')::uuid;
  ELSE
    v_result := public.place_storefront_order_internal_20260710(p_brand_slug,v_safe_customer,v_safe_items,p_payment_method,p_notes,p_fulfillment,p_branch_id);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=(v_result->>'order_id')::uuid FOR UPDATE;
  IF NULLIF(trim(p_promo_code), '') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'variant_id', oi.variant_id, 'line_total', oi.line_total
    )), '[]'::jsonb) INTO v_authoritative_items
    FROM public.order_items oi WHERE oi.order_id = v_order.id;

    v_promo := public.validate_promo_code(p_brand_slug, p_promo_code, v_order.subtotal, v_authoritative_items, NULL);
    IF NOT COALESCE((v_promo->>'valid')::boolean, false) THEN
      RAISE EXCEPTION 'PROMO_%', COALESCE(v_promo->>'reason', 'INVALID');
    END IF;
    v_discount := (v_promo->>'discount_amount')::numeric;
    SELECT pc.id INTO v_promo_id FROM public.promo_codes pc
      WHERE pc.brand_id=v_brand_id AND upper(pc.code)=upper(trim(p_promo_code));
    UPDATE public.orders SET discount=v_discount, promo_code_id=v_promo_id, promo_code=upper(trim(p_promo_code)),
      total=greatest(0, subtotal - v_discount) + shipping + tax_amount
    WHERE id=v_order.id;
  END IF;

  SELECT customer_id, confirmation_email_token, invoice_number INTO v_customer_id,v_email_token,v_invoice_number
  FROM public.orders WHERE id=v_order.id;

  v_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_email := NULLIF(trim(p_customer->>'email'), '');
  v_uid := auth.uid();
  v_matched_customer_id := NULL;

  -- Step 1: Match by active user session id (explicitly logged in takes precedence)
  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_matched_customer_id FROM public.customers
      WHERE brand_id = v_brand_id AND auth_user_id = v_uid LIMIT 1;
  END IF;

  -- Match by email of registered account
  IF v_matched_customer_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_matched_customer_id FROM public.customers
      WHERE brand_id = v_brand_id AND auth_user_id IS NOT NULL AND lower(email) = lower(v_email) LIMIT 1;
  END IF;

  -- Match by phone of registered account ONLY if email is also matching or no email is entered (protects registered profile emails)
  IF v_matched_customer_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_matched_customer_id FROM public.customers
      WHERE brand_id = v_brand_id 
        AND auth_user_id IS NOT NULL 
        AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(trim(v_phone), '\D', '', 'g')
        AND (v_email IS NULL OR lower(email) = lower(v_email))
      LIMIT 1;
  END IF;

  -- Match by any guest email
  IF v_matched_customer_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_matched_customer_id FROM public.customers
      WHERE brand_id = v_brand_id AND lower(email) = lower(v_email) LIMIT 1;
  END IF;

  -- Match by any guest phone ONLY if email matches or is null
  IF v_matched_customer_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_matched_customer_id FROM public.customers
      WHERE brand_id = v_brand_id 
        AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(trim(v_phone), '\D', '', 'g')
        AND (v_email IS NULL OR lower(email) = lower(v_email))
      LIMIT 1;
  END IF;

  -- Handle merging/resolution
  IF v_matched_customer_id IS NOT NULL AND v_matched_customer_id <> v_customer_id THEN
    -- A matching profile exists:
    
    -- 1. FIRST update the customer_id on public.customer_addresses
    UPDATE public.customer_addresses
    SET customer_id = v_matched_customer_id,
        is_default = CASE
          WHEN EXISTS (
            SELECT 1 FROM public.customer_addresses
            WHERE customer_id = v_matched_customer_id AND is_default
          ) THEN false
          ELSE is_default
        END
    WHERE customer_id = v_customer_id;
    
    -- 2. SECOND update the customer_id on public.orders
    UPDATE public.orders SET customer_id = v_matched_customer_id WHERE id = v_order.id;
    
    -- 3. Safely delete the temporary blank guest customer record
    DELETE FROM public.customers WHERE id = v_customer_id;
    
    -- Redirect pointer to the matched profile
    v_customer_id := v_matched_customer_id;
  END IF;

  -- Safe update of contact details directly on the correct row to avoid duplicate constraints
  BEGIN
    UPDATE public.customers SET
      phone = COALESCE(v_phone, phone),
      email = COALESCE(email, v_email), -- protect existing email or assign if null
      name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name)
    WHERE id = v_customer_id;
  EXCEPTION WHEN unique_violation THEN
    -- Fallback: If phone number violates a unique constraint (e.g. phone already used by another customer account)
    -- Keep the phone null/unchanged on this profile, but still record the guest's name and entered email!
    UPDATE public.customers SET
      email = COALESCE(email, v_email),
      name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name)
    WHERE id = v_customer_id;
  END;

  -- Combine guest orders that have the same email or mobile with a registered user in the same profile (respecting email boundary)
  IF (SELECT auth_user_id FROM public.customers WHERE id = v_customer_id) IS NOT NULL THEN
    -- Consolidate any other historical guest customer orders into this registered customer's master profile
    UPDATE public.orders SET customer_id = v_customer_id
      WHERE customer_id IN (
        SELECT id FROM public.customers
        WHERE brand_id = v_brand_id
          AND id <> v_customer_id
          AND auth_user_id IS NULL
          AND (
            (v_phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(trim(v_phone), '\D', '', 'g') AND (email IS NULL OR lower(email) = lower(v_email)))
            OR (v_email IS NOT NULL AND lower(email) = lower(v_email))
          )
      );

    -- Consolidate guest addresses
    UPDATE public.customer_addresses
    SET customer_id = v_customer_id,
        is_default = false
      WHERE customer_id IN (
        SELECT id FROM public.customers
        WHERE brand_id = v_brand_id
          AND id <> v_customer_id
          AND auth_user_id IS NULL
          AND (
            (v_phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(trim(v_phone), '\D', '', 'g') AND (email IS NULL OR lower(email) = lower(v_email)))
            OR (v_email IS NOT NULL AND lower(email) = lower(v_email))
          )
      );

    -- Clean up duplicate guest customer rows
    DELETE FROM public.customers
      WHERE brand_id = v_brand_id
        AND id <> v_customer_id
        AND auth_user_id IS NULL
        AND (
          (v_phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(trim(v_phone), '\D', '', 'g') AND (email IS NULL OR lower(email) = lower(v_email)))
          OR (v_email IS NOT NULL AND lower(email) = lower(v_email))
        );
  END IF;

  RETURN v_result || jsonb_build_object('confirmation_email_token',v_email_token,'invoice_number',v_invoice_number,
    'promo_code', CASE WHEN v_discount > 0 THEN upper(trim(p_promo_code)) ELSE NULL END,'discount',v_discount);
END;
$$;

-- Ensure public execute permissions are correctly in place
REVOKE ALL ON FUNCTION public.place_storefront_order_core(text,jsonb,jsonb,text,text,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_storefront_order_core(text,jsonb,jsonb,text,text,text,uuid,text,text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
