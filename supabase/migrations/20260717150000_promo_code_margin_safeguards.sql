-- Migration: Add profit margin safeguards to promo codes
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS exclude_low_margin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margin_threshold numeric(5,2) NOT NULL DEFAULT 20.00;

-- Drop functions to avoid parameter ambiguity
DROP FUNCTION IF EXISTS public.validate_promo_code(text,text,numeric,jsonb,uuid);

CREATE OR REPLACE FUNCTION public.validate_promo_code(
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

  -- Filter items based on sale status and/or profit margin safeguards
  IF p_items IS NOT NULL AND (v_promo.exclude_sale_items OR v_promo.exclude_low_margin) THEN
    SELECT COALESCE(sum(greatest(COALESCE((item->>'line_total')::numeric, 0), 0)), 0)
      INTO v_discountable_subtotal
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    JOIN public.product_variants pv ON pv.id = (item->>'variant_id')::uuid
    WHERE pv.brand_id = v_brand_id
      -- 1. Exclude items on sale if requested
      AND (NOT v_promo.exclude_sale_items OR NOT (COALESCE(pv.original_price, 0) > pv.selling_price))
      -- 2. Exclude low-margin items if requested
      AND (
        NOT v_promo.exclude_low_margin
        OR (
          pv.selling_price > 0
          AND (
            CASE v_promo.discount_type
              WHEN 'percentage' THEN
                -- Post-discount price for percentage promo codes
                (pv.selling_price * (1.0 - v_promo.discount_value / 100.0)) > 0
                AND (
                  (pv.selling_price * (1.0 - v_promo.discount_value / 100.0) - COALESCE(pv.cost_price, 0))
                  / (pv.selling_price * (1.0 - v_promo.discount_value / 100.0))
                ) * 100.0 >= v_promo.margin_threshold
              ELSE
                -- For fixed promo codes, compute proportional cart discount rate
                (
                  p_subtotal > 0
                  AND (1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price > 0
                  AND (
                    (
                      (1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price
                      - COALESCE(pv.cost_price, 0)
                    )
                    / ((1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price)
                  ) * 100.0 >= v_promo.margin_threshold
                )
            END
          )
        )
      );

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

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid) TO anon, authenticated;

-- Reload schema for PostgREST
NOTIFY pgrst, 'reload schema';
