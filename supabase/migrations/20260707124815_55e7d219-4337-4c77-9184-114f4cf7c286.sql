
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS base_price numeric(10,2);

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS hero_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS about_ar text,
  ADD COLUMN IF NOT EXISTS about_en text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'admin';

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS cod_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS card_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS benefit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS benefit_qr_url text;

GRANT SELECT ON public.brands TO anon;
DROP POLICY IF EXISTS "brands public read" ON public.brands;
CREATE POLICY "brands public read" ON public.brands
  FOR SELECT TO anon USING (is_active = true);

GRANT SELECT ON public.products TO anon;
DROP POLICY IF EXISTS "products public read" ON public.products;
CREATE POLICY "products public read" ON public.products
  FOR SELECT TO anon USING (
    is_active = true
    AND EXISTS (SELECT 1 FROM public.brands b WHERE b.id = products.brand_id AND b.is_active)
  );

GRANT SELECT ON public.product_variants TO anon;
DROP POLICY IF EXISTS "variants public read" ON public.product_variants;
CREATE POLICY "variants public read" ON public.product_variants
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.brands b ON b.id = p.brand_id
      WHERE p.id = product_variants.product_id AND p.is_active AND b.is_active
    )
  );

CREATE OR REPLACE VIEW public.brand_public_settings
WITH (security_invoker = on) AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency,
  bs.primary_color, bs.text_color, bs.background_color, bs.font_family, bs.font_url,
  bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url, bs.footer_note
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

DROP POLICY IF EXISTS "business_settings public read" ON public.business_settings;
CREATE POLICY "business_settings public read" ON public.business_settings
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.brands b WHERE b.id = business_settings.brand_id AND b.is_active)
  );
GRANT SELECT ON public.business_settings TO anon;

CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand public.brands%ROWTYPE; v_settings public.business_settings%ROWTYPE;
  v_owner uuid; v_customer_id uuid; v_order_id uuid; v_invoice int;
  v_item jsonb; v_variant public.product_variants%ROWTYPE; v_product public.products%ROWTYPE;
  v_subtotal numeric(10,2) := 0; v_qty int; v_line_total numeric(10,2);
  v_phone text; v_snapshot jsonb := '{}'::jsonb;
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

  v_owner := COALESCE(v_brand.created_by, v_settings.user_id);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NO_BRAND_OWNER'; END IF;

  v_phone := NULLIF(trim(p_customer->>'phone'), '');
  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND phone = v_phone LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (user_id, brand_id, name, phone, email, address, city, region, road, house, flat)
    VALUES (v_owner, v_brand.id,
      COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest'),
      v_phone, NULLIF(trim(p_customer->>'email'), ''),
      NULLIF(trim(p_customer->>'address'), ''),
      NULLIF(trim(p_customer->>'city'), ''),
      NULLIF(trim(p_customer->>'region'), ''),
      NULLIF(trim(p_customer->>'road'), ''),
      NULLIF(trim(p_customer->>'house'), ''),
      NULLIF(trim(p_customer->>'flat'), '')
    ) RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers SET
      name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
      email = COALESCE(NULLIF(trim(p_customer->>'email'), ''), email),
      address = COALESCE(NULLIF(trim(p_customer->>'address'), ''), address),
      city = COALESCE(NULLIF(trim(p_customer->>'city'), ''), city),
      region = COALESCE(NULLIF(trim(p_customer->>'region'), ''), region),
      road = COALESCE(NULLIF(trim(p_customer->>'road'), ''), road),
      house = COALESCE(NULLIF(trim(p_customer->>'house'), ''), house),
      flat = COALESCE(NULLIF(trim(p_customer->>'flat'), ''), flat)
    WHERE id = v_customer_id;
  END IF;

  v_invoice := v_settings.next_invoice_number;
  UPDATE public.business_settings SET next_invoice_number = next_invoice_number + 1
    WHERE brand_id = v_brand.id;

  INSERT INTO public.orders (user_id, brand_id, customer_id, invoice_number, status,
    payment_method, payment_status, currency, notes, channel)
  VALUES (v_owner, v_brand.id, v_customer_id, v_invoice, 'pending',
    p_payment_method, 'unpaid', v_settings.currency, p_notes, 'storefront')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_variant.brand_id <> v_brand.id THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;
    IF NOT v_product.is_active THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;
    IF v_variant.stock_main < v_qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id; END IF;

    v_line_total := (v_variant.selling_price * v_qty)::numeric(10,2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (user_id, brand_id, order_id, product_id, variant_id,
      description, quantity, unit_price, line_total, location)
    VALUES (v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
      COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price, v_line_total, 'main');

    UPDATE public.product_variants SET stock_main = stock_main - v_qty WHERE id = v_variant.id;
    v_snapshot := v_snapshot || jsonb_build_object(v_variant.id::text || '|main', v_qty);
  END LOOP;

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal,
    stock_deducted = true, stock_snapshot = v_snapshot
  WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text) TO anon, authenticated;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.products; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customers; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
