-- 1. Create a lightweight, highly secure idempotency_claims table to serialize parallel checkouts
CREATE TABLE IF NOT EXISTS public.idempotency_claims (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE, -- Populated after successful transaction completion
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, idempotency_key)
);

-- Table Grants: Required for PostgREST parser validation before RLS evaluates
GRANT SELECT, INSERT, UPDATE ON public.idempotency_claims TO anon, authenticated;

-- Enable Row Level Security (RLS) to protect against raw client access
ALTER TABLE public.idempotency_claims ENABLE ROW LEVEL SECURITY;

-- Explicit Self-Documenting Default-Deny Policy
-- Standard client operations are blocked. Access is restricted solely to security-definer RPC execution.
DROP POLICY IF EXISTS "block direct client access" ON public.idempotency_claims;
CREATE POLICY "block direct client access" ON public.idempotency_claims
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- 2. Add idempotency_key and request_hash to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS request_hash text;

-- 3. Add brand-scoped unique constraint on idempotency_key (allows multiple nulls)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS unique_brand_idempotency;
ALTER TABLE public.orders ADD CONSTRAINT unique_brand_idempotency UNIQUE (brand_id, idempotency_key);


-- 4. Drop existing place_storefront_order function to update its signature cleanly
DROP FUNCTION IF EXISTS public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text
);
DROP FUNCTION IF EXISTS public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text, text
);


-- 5. Recreate public.place_storefront_order with p_idempotency_key, serialize claims, and request hashing
CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
  p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
  p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL,
  p_shipping_fee numeric DEFAULT NULL, p_shipping_zone text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_tax_rate numeric;
  v_vat_inclusive boolean;
  v_shipping_fee numeric;
  v_tax_amount numeric;
  v_taxable numeric;
  v_total numeric;
  v_invoice_number integer;
  
  -- Payload Fingerprint Variables
  v_current_hash text;
  v_claim public.idempotency_claims%ROWTYPE;
BEGIN
  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE slug = p_brand_slug AND is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  -- Compute fingerprint of incoming parameters to lock payload integrity
  v_current_hash := md5(
    COALESCE(p_customer::text, '') || 
    COALESCE(p_items::text, '') || 
    COALESCE(p_payment_method, '') || 
    COALESCE(p_notes, '') || 
    COALESCE(p_fulfillment, '')
  );

  -- 1. Claims Serialization Guard: Grab the lock before doing ANY side-effects
  IF p_idempotency_key IS NOT NULL THEN
    BEGIN
      -- Attempt to claim this key instantly
      INSERT INTO public.idempotency_claims (brand_id, idempotency_key, request_hash)
      VALUES (v_brand_id, p_idempotency_key, v_current_hash);
      
    EXCEPTION WHEN unique_violation THEN
      -- Key is already locked or completed! Re-query the row and obtain a FOR UPDATE lock.
      -- If transaction A is still running, Request B blocks here until Transaction A completes (commits or rolls back).
      SELECT * INTO v_claim
      FROM public.idempotency_claims
      WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key
      FOR UPDATE;
      
      -- Verify Request Integrity: Block hijacking / different cart payload reuse
      IF v_claim.request_hash IS DISTINCT FROM v_current_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
      END IF;
      
      -- If the winner transaction committed successfully, cleanly return their completed receipt data
      IF v_claim.order_id IS NOT NULL THEN
        SELECT id, invoice_number, total, shipping, tax_amount INTO v_order_id, v_invoice_number, v_total, v_shipping_fee, v_tax_amount
        FROM public.orders
        WHERE id = v_claim.order_id;
        
        RETURN jsonb_build_object(
          'success', true,
          'order_id', v_order_id,
          'invoice_number', v_invoice_number,
          'total', v_total,
          'shipping', v_shipping_fee,
          'tax_amount', v_tax_amount
        );
      ELSE
        -- The winning transaction rolled back. We now own the active claim lock and can proceed to place the order ourselves!
        UPDATE public.idempotency_claims
        SET request_hash = v_current_hash
        WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
      END IF;
    END;
  END IF;

  -- 2. From here on, execution is completely serialized and locked
  IF p_payment_method = 'benefit' THEN
    IF p_benefit_receipt_id IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_REQUIRED'; END IF;
    SELECT * INTO v_receipt
    FROM public.pending_benefit_receipts
    WHERE id = p_benefit_receipt_id
      AND brand_id = v_brand_id
      AND uploaded_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID'; END IF;
  ELSIF p_benefit_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  v_result := public.place_storefront_order_core(
    p_brand_slug, p_customer, p_items, p_payment_method, p_notes,
    p_fulfillment, p_branch_id, p_digital_channel, p_digital_contact, p_promo_code
  );
  v_order_id := (v_result->>'order_id')::uuid;

  IF p_payment_method = 'benefit' THEN
    UPDATE public.orders
    SET status = 'pending_verification',
        payment_status = 'unpaid',
        benefit_receipt_url = v_receipt.public_url,
        benefit_receipt_key = v_receipt.object_key
    WHERE id = v_order_id AND brand_id = v_brand_id;

    UPDATE public.pending_benefit_receipts
    SET consumed_at = now()
    WHERE id = v_receipt.id;
  END IF;

  -- Authoritatively apply VAT inclusive/exclusive configurations and custom shipping zone fees
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  
  SELECT COALESCE(default_tax_rate, 10.0), COALESCE(vat_inclusive, false) INTO v_tax_rate, v_vat_inclusive
  FROM public.business_settings WHERE brand_id = v_brand_id;

  v_shipping_fee := COALESCE(p_shipping_fee, v_order.shipping);
  v_taxable := greatest(0, v_order.subtotal - v_order.discount);
  
  IF v_vat_inclusive THEN
    v_tax_amount := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping_fee;
  ELSE
    v_tax_amount := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax_amount + v_shipping_fee;
  END IF;

  -- Apply final calculations
  UPDATE public.orders
  SET shipping = v_shipping_fee,
      tax_rate = v_tax_rate,
      tax_amount = v_tax_amount,
      total = v_total,
      idempotency_key = p_idempotency_key, 
      request_hash = v_current_hash,       
      delivery_address_snapshot = CASE 
        WHEN p_shipping_zone IS NOT NULL THEN COALESCE(delivery_address_snapshot, '{}'::jsonb) || jsonb_build_object('shipping_zone', p_shipping_zone)
        ELSE delivery_address_snapshot
      END
  WHERE id = v_order_id;

  -- 3. Link the successfully completed order to our claim record to unblock any waiting parallel queries
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_claims
    SET order_id = v_order_id
    WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
  END IF;

  -- Reload values to include recalculated totals in trigger or return payload
  v_result := v_result || jsonb_build_object('total', v_total, 'shipping', v_shipping_fee, 'tax_amount', v_tax_amount);

  RETURN v_result;
END;
$$;

-- Expose execution privileges to anon/authenticated with new signature
GRANT EXECUTE ON FUNCTION public.place_storefront_order(
  text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
