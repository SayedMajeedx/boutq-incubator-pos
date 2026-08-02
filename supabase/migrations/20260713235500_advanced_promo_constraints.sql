-- Advanced, tenant-scoped promo constraints with authoritative checkout enforcement.
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS maximum_discount_amount numeric(14,3),
  ADD COLUMN IF NOT EXISTS first_time_customers_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_sale_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_limit_per_customer integer;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_maximum_discount_check,
  ADD CONSTRAINT promo_codes_maximum_discount_check CHECK (
    maximum_discount_amount IS NULL OR
    (discount_type = 'percentage' AND maximum_discount_amount > 0)
  ),
  DROP CONSTRAINT IF EXISTS promo_codes_usage_limit_check,
  ADD CONSTRAINT promo_codes_usage_limit_check CHECK (
    usage_limit_per_customer IS NULL OR usage_limit_per_customer > 0
  );

DROP FUNCTION IF EXISTS public.validate_promo_code(text,text,numeric);
DROP FUNCTION IF EXISTS public.validate_promo_code(text,text,numeric,jsonb);
DROP FUNCTION IF EXISTS public.validate_promo_code(text,text,numeric,jsonb,uuid);
CREATE FUNCTION public.validate_promo_code(
  p_brand_slug text,
  p_code text,
  p_subtotal numeric,
  p_items jsonb DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_brand_id uuid;
  v_user_id uuid := auth.uid();
  v_effective_customer_id uuid;
  v_effective_auth_user_id uuid;
  v_discountable_subtotal numeric(14,3) := greatest(COALESCE(p_subtotal, 0), 0);
  v_discount numeric(14,3);
  v_historical_orders integer := 0;
  v_prior_uses integer := 0;
BEGIN
  IF NULLIF(trim(p_code), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_REQUIRED');
  END IF;

  SELECT pc.* INTO v_promo
  FROM public.promo_codes pc
  JOIN public.brands b ON b.id = pc.brand_id
  WHERE b.slug = p_brand_slug AND b.is_active = true
    AND upper(pc.code) = upper(trim(p_code));

  IF v_promo.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_NOT_FOUND');
  END IF;
  v_brand_id := v_promo.brand_id;
  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_INACTIVE');
  END IF;
  IF v_promo.minimum_order_amount IS NOT NULL AND p_subtotal < v_promo.minimum_order_amount THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'MINIMUM_NOT_MET',
      'minimum_order_amount', v_promo.minimum_order_amount);
  END IF;

  IF v_promo.first_time_customers_only OR v_promo.usage_limit_per_customer IS NOT NULL THEN
    IF p_customer_id IS NOT NULL THEN
      IF NOT (public.is_super_admin() OR (public.is_admin() AND public.current_brand_id() = v_brand_id)) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_ACCESS_DENIED');
      END IF;
      SELECT c.id, c.auth_user_id INTO v_effective_customer_id, v_effective_auth_user_id
      FROM public.customers c WHERE c.id = p_customer_id AND c.brand_id = v_brand_id;
      IF v_effective_customer_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_REQUIRED');
      END IF;
    ELSE
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'AUTH_REQUIRED');
      END IF;
      v_effective_auth_user_id := v_user_id;
    END IF;

    SELECT count(*) INTO v_historical_orders
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.brand_id = v_brand_id
      AND ((v_effective_auth_user_id IS NOT NULL AND c.auth_user_id = v_effective_auth_user_id)
        OR (v_effective_auth_user_id IS NULL AND c.id = v_effective_customer_id))
      AND (o.status IN ('completed', 'paid') OR o.payment_status = 'paid');

    IF v_promo.first_time_customers_only AND v_historical_orders > 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'FIRST_ORDER_ONLY');
    END IF;

    IF v_promo.usage_limit_per_customer IS NOT NULL THEN
      SELECT count(*) INTO v_prior_uses
      FROM public.orders o
      JOIN public.customers c ON c.id = o.customer_id
      WHERE o.brand_id = v_brand_id
        AND ((v_effective_auth_user_id IS NOT NULL AND c.auth_user_id = v_effective_auth_user_id)
          OR (v_effective_auth_user_id IS NULL AND c.id = v_effective_customer_id))
        AND o.promo_code_id = v_promo.id
        AND COALESCE(o.status, '') NOT IN ('cancelled', 'draft');
      IF v_prior_uses >= v_promo.usage_limit_per_customer THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'USAGE_LIMIT_REACHED',
          'usage_limit_per_customer', v_promo.usage_limit_per_customer);
      END IF;
    END IF;
  END IF;

  IF v_promo.exclude_sale_items AND p_items IS NOT NULL THEN
    SELECT COALESCE(sum(greatest(COALESCE((item->>'line_total')::numeric, 0), 0)), 0)
      INTO v_discountable_subtotal
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    JOIN public.product_variants pv ON pv.id = (item->>'variant_id')::uuid
    WHERE pv.brand_id = v_brand_id
      AND NOT (COALESCE(pv.original_price, 0) > pv.selling_price);
    v_discountable_subtotal := least(v_discountable_subtotal, greatest(COALESCE(p_subtotal, 0), 0));
    IF v_discountable_subtotal <= 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'NO_ELIGIBLE_ITEMS');
    END IF;
  END IF;

  v_discount := CASE v_promo.discount_type
    WHEN 'percentage' THEN round(v_discountable_subtotal * v_promo.discount_value / 100, 3)
    ELSE least(v_promo.discount_value, v_discountable_subtotal)
  END;
  IF v_promo.discount_type = 'percentage' AND v_promo.maximum_discount_amount IS NOT NULL THEN
    v_discount := least(v_discount, v_promo.maximum_discount_amount);
  END IF;
  v_discount := least(greatest(v_discount, 0), v_discountable_subtotal);

  RETURN jsonb_build_object(
    'valid', true, 'code', upper(v_promo.code),
    'promo_code_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', v_discount,
    'discountable_subtotal', v_discountable_subtotal,
    'maximum_discount_amount', v_promo.maximum_discount_amount,
    'minimum_order_amount', v_promo.minimum_order_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid) TO anon, authenticated;

-- Recreate checkout wrapper so final validation uses authoritative saved order lines.
CREATE OR REPLACE FUNCTION public.place_storefront_order(
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
  UPDATE public.customers SET phone=NULLIF(trim(p_customer->>'phone'),''), email=NULLIF(trim(p_customer->>'email'),'') WHERE id=v_customer_id;
  RETURN v_result || jsonb_build_object('confirmation_email_token',v_email_token,'invoice_number',v_invoice_number,
    'promo_code', CASE WHEN v_discount > 0 THEN upper(trim(p_promo_code)) ELSE NULL END,'discount',v_discount);
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text,text) TO anon, authenticated;

-- Make the new columns immediately visible to PostgREST after SQL Editor runs.
NOTIFY pgrst, 'reload schema';
