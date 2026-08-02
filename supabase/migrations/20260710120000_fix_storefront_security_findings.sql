-- Close storefront account-linking, public invoice, and branch-data findings.

-- A customer account may only claim a pre-existing row by the verified email
-- stored in auth.users. User-supplied phone numbers are profile data, never
-- proof of identity.
CREATE OR REPLACE FUNCTION public.link_storefront_customer(
  p_brand_slug text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_brand public.brands%ROWTYPE;
  v_owner uuid;
  v_customer_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT email, email_confirmed_at INTO v_email, v_email_confirmed_at
    FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_EMAIL_REQUIRED';
  END IF;

  SELECT * INTO v_brand FROM public.brands
    WHERE slug = p_brand_slug AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  SELECT COALESCE(v_brand.created_by,
                  (SELECT user_id FROM public.business_settings WHERE brand_id = v_brand.id LIMIT 1))
    INTO v_owner;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NO_BRAND_OWNER'; END IF;

  SELECT id INTO v_customer_id FROM public.customers
    WHERE brand_id = v_brand.id AND auth_user_id = v_uid LIMIT 1;

  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id
        AND auth_user_id IS NULL
        AND lower(email) = lower(v_email)
      ORDER BY created_at ASC
      LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (user_id, brand_id, name, phone, email, auth_user_id)
    VALUES (v_owner, v_brand.id,
            COALESCE(NULLIF(trim(p_name), ''), split_part(v_email, '@', 1), 'Customer'),
            NULLIF(trim(p_phone), ''), v_email, v_uid)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers
      SET auth_user_id = v_uid,
          email = v_email,
          name = COALESCE(NULLIF(trim(p_name), ''), name),
          phone = COALESCE(NULLIF(trim(p_phone), ''), phone)
      WHERE id = v_customer_id
        AND (auth_user_id IS NULL OR auth_user_id = v_uid);
  END IF;

  RETURN jsonb_build_object('customer_id', v_customer_id);
END;
$$;
REVOKE ALL ON FUNCTION public.link_storefront_customer(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_storefront_customer(text, text, text) TO authenticated;

-- Preserve the current order implementation behind a locked internal name.
-- The public wrapper removes contact identifiers before customer selection so
-- neither authenticated nor guest checkout can match/claim a row by phone or
-- caller-supplied email. It restores the contact data only on the customer row
-- that was selected by auth_user_id or freshly created for this order.
ALTER FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid)
  RENAME TO place_storefront_order_internal_20260710;
REVOKE ALL ON FUNCTION public.place_storefront_order_internal_20260710(text, jsonb, jsonb, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.place_storefront_order(
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
  v_safe_customer jsonb;
BEGIN
  v_safe_customer := COALESCE(p_customer, '{}'::jsonb) - 'phone' - 'email';

  v_result := public.place_storefront_order_internal_20260710(
    p_brand_slug, v_safe_customer, p_items, p_payment_method,
    p_notes, p_fulfillment, p_branch_id
  );

  SELECT customer_id INTO v_customer_id
    FROM public.orders WHERE id = (v_result->>'order_id')::uuid;

  UPDATE public.customers SET
    phone = NULLIF(trim(p_customer->>'phone'), ''),
    email = NULLIF(trim(p_customer->>'email'), '')
  WHERE id = v_customer_id;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid)
  TO anon, authenticated;

-- Public invoices use an independently revocable capability token instead of
-- exposing the order's primary key in a public URL.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_invoice_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmation_email_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_invoice_token_key
  ON public.orders(public_invoice_token);
CREATE UNIQUE INDEX IF NOT EXISTS orders_confirmation_email_token_key
  ON public.orders(confirmation_email_token);

-- Include the one-purpose email token in the checkout response. It authorizes
-- exactly one order and cannot be used to read or modify that order.
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
  v_safe_customer jsonb;
BEGIN
  v_safe_customer := COALESCE(p_customer, '{}'::jsonb) - 'phone' - 'email';
  v_result := public.place_storefront_order_internal_20260710(
    p_brand_slug, v_safe_customer, p_items, p_payment_method,
    p_notes, p_fulfillment, p_branch_id
  );
  SELECT customer_id, confirmation_email_token
    INTO v_customer_id, v_email_token
    FROM public.orders WHERE id = (v_result->>'order_id')::uuid;
  UPDATE public.customers SET
    phone = NULLIF(trim(p_customer->>'phone'), ''),
    email = NULLIF(trim(p_customer->>'email'), '')
  WHERE id = v_customer_id;
  RETURN v_result || jsonb_build_object('confirmation_email_token', v_email_token);
END;
$$;

-- Anonymous callers receive only the fields checkout renders. In particular,
-- phone and internal ownership fields are never exposed.
CREATE OR REPLACE FUNCTION public.get_public_branches(p_brand_id uuid)
RETURNS TABLE (
  id uuid, name_ar text, name_en text, location_ar text, location_en text,
  notes_ar text, notes_en text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT br.id, br.name_ar, br.name_en, br.location_ar, br.location_en,
         br.notes_ar, br.notes_en
  FROM public.branches br
  JOIN public.brands b ON b.id = br.brand_id
  WHERE br.brand_id = p_brand_id AND br.is_active = true AND b.is_active = true
  ORDER BY br.created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_public_branches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branches(uuid) TO anon, authenticated;
REVOKE SELECT ON public.branches FROM anon;
