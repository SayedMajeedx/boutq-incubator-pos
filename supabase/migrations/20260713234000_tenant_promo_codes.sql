-- Tenant-scoped promotional codes with server-side checkout enforcement.
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(14,3) NOT NULL CHECK (discount_value > 0),
  minimum_order_amount numeric(14,3) CHECK (minimum_order_amount IS NULL OR minimum_order_amount >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_percentage_check CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_brand_code_unique
  ON public.promo_codes (brand_id, upper(code));

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand members manage promo codes" ON public.promo_codes;
CREATE POLICY "Brand members manage promo codes" ON public.promo_codes
FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR (public.is_admin() AND promo_codes.brand_id IS NOT DISTINCT FROM public.current_brand_id())
)
WITH CHECK (
  public.is_super_admin()
  OR (public.is_admin() AND promo_codes.brand_id IS NOT DISTINCT FROM public.current_brand_id())
);

REVOKE ALL ON public.promo_codes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_code text;

CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_brand_slug text,
  p_code text,
  p_subtotal numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_discount numeric(14,3);
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
  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_INACTIVE');
  END IF;
  IF v_promo.minimum_order_amount IS NOT NULL AND p_subtotal < v_promo.minimum_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'MINIMUM_NOT_MET',
      'minimum_order_amount', v_promo.minimum_order_amount
    );
  END IF;

  v_discount := CASE v_promo.discount_type
    WHEN 'percentage' THEN round(p_subtotal * v_promo.discount_value / 100, 3)
    ELSE v_promo.discount_value
  END;
  v_discount := least(greatest(v_discount, 0), greatest(p_subtotal, 0));

  RETURN jsonb_build_object(
    'valid', true, 'code', upper(v_promo.code),
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', v_discount,
    'minimum_order_amount', v_promo.minimum_order_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(text,text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text,text,numeric) TO anon, authenticated;

-- Replace the public checkout wrapper with an optional promo argument. The
-- internal allocator remains responsible for authoritative product pricing.
DROP FUNCTION IF EXISTS public.place_storefront_order(text,jsonb,jsonb,text,text,text,uuid,text,text);
CREATE OR REPLACE FUNCTION public.place_storefront_order(
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
  v_result jsonb; v_customer_id uuid; v_email_token uuid; v_invoice_number integer;
  v_safe_customer jsonb; v_safe_items jsonb; v_brand_id uuid;
  v_digital_enabled boolean; v_pickup_enabled boolean;
  v_order public.orders%ROWTYPE; v_promo jsonb; v_discount numeric(14,3) := 0; v_promo_id uuid;
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
    v_promo := public.validate_promo_code(p_brand_slug, p_promo_code, v_order.subtotal);
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
