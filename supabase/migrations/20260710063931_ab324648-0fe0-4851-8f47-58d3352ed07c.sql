
-- 1) Branches table (per brand)
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name_ar text,
  name_en text,
  address_ar text,
  address_en text,
  phone text,
  notes_ar text,
  notes_en text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Public can read active branches for active brands (needed at checkout)
CREATE POLICY "public read active branches"
  ON public.branches FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (SELECT 1 FROM public.brands b WHERE b.id = branches.brand_id AND b.is_active = true)
  );

-- Admins can manage branches for their brand
CREATE POLICY "admin manage branches"
  ON public.branches FOR ALL
  TO authenticated
  USING (public.is_admin() AND public.can_access_brand(brand_id))
  WITH CHECK (public.is_admin() AND public.can_access_brand(brand_id));

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_branches_brand ON public.branches(brand_id, is_active, sort_order);

-- 2) Custom fields schema on products (admin defines up to N per product)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Shape: [{ "key":"length", "label_ar":"الطول", "label_en":"Length",
--          "type":"text"|"number"|"select", "options":["A","B"], "required":true }]

-- 3) Snapshot chosen variant + customer-entered custom field values on each order item
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS selected_variant jsonb,   -- {size,color,fabric,sku}
  ADD COLUMN IF NOT EXISTS custom_field_values jsonb NOT NULL DEFAULT '{}'::jsonb;
  -- shape: [{label_ar,label_en,value}]  (frozen at time of order)

-- 4) Branch selected at checkout for pickup orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- 5) Brand-configurable email sender name + editable template intro
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS email_sender_name text,
  ADD COLUMN IF NOT EXISTS email_intro_ar text,
  ADD COLUMN IF NOT EXISTS email_intro_en text,
  ADD COLUMN IF NOT EXISTS email_footer_ar text,
  ADD COLUMN IF NOT EXISTS email_footer_en text;

-- 6) Updated RPC — accepts branch, per-item custom_fields + selected_variant snapshot
DROP FUNCTION IF EXISTS public.place_storefront_order(text, jsonb, jsonb, text, text, text);
CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE; v_settings public.business_settings%ROWTYPE;
  v_owner uuid; v_customer_id uuid; v_order_id uuid; v_invoice int;
  v_item jsonb; v_variant public.product_variants%ROWTYPE; v_product public.products%ROWTYPE;
  v_subtotal numeric(10,2) := 0; v_qty int; v_line_total numeric(10,2);
  v_phone text; v_email text; v_uid uuid := auth.uid();
  v_shipping numeric(10,2) := 0;
  v_address_id uuid;
  v_snapshot jsonb := '{}'::jsonb;
  v_selected_variant jsonb;
  v_custom_fields jsonb;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = v_brand.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_NOT_FOUND'; END IF;

  IF p_payment_method NOT IN ('cod','card','benefit') THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
  IF (p_payment_method = 'cod' AND NOT v_settings.cod_enabled)
     OR (p_payment_method = 'card' AND NOT v_settings.card_enabled)
     OR (p_payment_method = 'benefit' AND NOT v_settings.benefit_enabled) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED';
  END IF;

  IF p_fulfillment NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'INVALID_FULFILLMENT'; END IF;
  IF p_fulfillment = 'delivery' AND NOT v_settings.delivery_enabled THEN RAISE EXCEPTION 'DELIVERY_DISABLED'; END IF;
  IF p_fulfillment = 'pickup'   AND NOT v_settings.pickup_enabled   THEN RAISE EXCEPTION 'PICKUP_DISABLED'; END IF;

  IF p_fulfillment = 'pickup' AND p_branch_id IS NOT NULL THEN
    PERFORM 1 FROM public.branches WHERE id = p_branch_id AND brand_id = v_brand.id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_BRANCH'; END IF;
  END IF;

  IF p_fulfillment = 'delivery' THEN
    v_shipping := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  v_owner := COALESCE(v_brand.created_by, v_settings.user_id);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NO_BRAND_OWNER'; END IF;

  v_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_email := NULLIF(trim(p_customer->>'email'), '');

  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND auth_user_id = v_uid LIMIT 1;
  END IF;
  IF v_customer_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND phone = v_phone LIMIT 1;
  END IF;
  IF v_customer_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND lower(email) = lower(v_email) LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      user_id, brand_id, auth_user_id, name, phone, email,
      region, block, road, house, flat, city, address
    ) VALUES (
      v_owner, v_brand.id, v_uid,
      COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest'),
      v_phone, v_email,
      NULLIF(trim(p_customer->>'region'), ''),
      NULLIF(trim(p_customer->>'block'), ''),
      NULLIF(trim(p_customer->>'road'), ''),
      NULLIF(trim(p_customer->>'house'), ''),
      NULLIF(trim(p_customer->>'flat'), ''),
      NULLIF(trim(p_customer->>'city'), ''),
      NULLIF(trim(p_customer->>'address'), '')
    ) RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers SET
      auth_user_id = COALESCE(auth_user_id, v_uid),
      name    = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
      phone   = COALESCE(v_phone, phone),
      email   = COALESCE(v_email, email),
      region  = COALESCE(NULLIF(trim(p_customer->>'region'), ''), region),
      block   = COALESCE(NULLIF(trim(p_customer->>'block'), ''), block),
      road    = COALESCE(NULLIF(trim(p_customer->>'road'), ''), road),
      house   = COALESCE(NULLIF(trim(p_customer->>'house'), ''), house),
      flat    = COALESCE(NULLIF(trim(p_customer->>'flat'), ''), flat),
      city    = COALESCE(NULLIF(trim(p_customer->>'city'), ''), city),
      address = COALESCE(NULLIF(trim(p_customer->>'address'), ''), address)
    WHERE id = v_customer_id;
  END IF;

  IF p_fulfillment = 'delivery'
     AND ( NULLIF(trim(p_customer->>'region'), '') IS NOT NULL
        OR NULLIF(trim(p_customer->>'road'), '')   IS NOT NULL
        OR NULLIF(trim(p_customer->>'block'), '')  IS NOT NULL
        OR NULLIF(trim(p_customer->>'house'), '')  IS NOT NULL) THEN
    INSERT INTO public.customer_addresses (
      user_id, brand_id, customer_id, label,
      region, block, road, house, flat, is_default
    ) VALUES (
      v_owner, v_brand.id, v_customer_id,
      COALESCE(NULLIF(trim(p_customer->>'label'), ''), 'Home'),
      NULLIF(trim(p_customer->>'region'), ''),
      NULLIF(trim(p_customer->>'block'), ''),
      NULLIF(trim(p_customer->>'road'), ''),
      NULLIF(trim(p_customer->>'house'), ''),
      NULLIF(trim(p_customer->>'flat'), ''),
      NOT EXISTS (SELECT 1 FROM public.customer_addresses WHERE customer_id = v_customer_id)
    ) RETURNING id INTO v_address_id;
  END IF;

  v_invoice := v_settings.next_invoice_number;
  UPDATE public.business_settings SET next_invoice_number = next_invoice_number + 1
    WHERE brand_id = v_brand.id;

  INSERT INTO public.orders (
    user_id, brand_id, customer_id, invoice_number, status,
    payment_method, payment_status, currency, notes, channel,
    fulfillment_method, shipping_address_id, shipping, branch_id
  ) VALUES (
    v_owner, v_brand.id, v_customer_id, v_invoice, 'pending',
    p_payment_method, 'unpaid', v_settings.currency, p_notes, 'storefront',
    p_fulfillment, v_address_id, v_shipping,
    CASE WHEN p_fulfillment = 'pickup' THEN p_branch_id ELSE NULL END
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_variant.brand_id <> v_brand.id THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;
    IF NOT v_product.is_active THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;
    IF v_variant.stock_main < v_qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id; END IF;

    v_line_total := (v_variant.selling_price * v_qty)::numeric(10,2);
    v_subtotal := v_subtotal + v_line_total;

    v_selected_variant := jsonb_build_object(
      'size', v_variant.size, 'color', v_variant.color,
      'fabric', v_variant.fabric, 'sku', v_variant.sku
    );
    v_custom_fields := COALESCE(v_item->'custom_fields', '[]'::jsonb);

    INSERT INTO public.order_items (
      user_id, brand_id, order_id, product_id, variant_id,
      description, quantity, unit_price, line_total, location,
      selected_variant, custom_field_values
    ) VALUES (
      v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
      COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
      v_line_total, 'main', v_selected_variant, v_custom_fields
    );

    UPDATE public.product_variants SET stock_main = stock_main - v_qty WHERE id = v_variant.id;
    v_snapshot := v_snapshot || jsonb_build_object(v_variant.id::text || '|main', v_qty);
  END LOOP;

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal + v_shipping,
    stock_deducted = true, stock_snapshot = v_snapshot
  WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice);
END;
$function$;

REVOKE ALL ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text, text, uuid) TO anon, authenticated;
