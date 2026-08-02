-- ============================================================================
-- Phase 2: Double-Entry Vendor Ledger Engine & Atomic POS Checkout
-- Migration: 20260802200000_incubator_pos_phase2_checkout_and_ledger.sql
-- ============================================================================

-- 1. Create vendor_ledger_entries table
CREATE TABLE IF NOT EXISTS public.vendor_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
    amount NUMERIC(10, 3) NOT NULL, -- Positive for sale credit, negative for commission/rent deduction or payout
    type TEXT NOT NULL CHECK (type IN ('sale', 'commission_deduction', 'rent_deduction', 'payout', 'adjustment')),
    reference_type TEXT CHECK (reference_type IN ('order', 'order_item', 'rent_invoice', 'payout', 'adjustment')),
    reference_id UUID,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_created ON public.vendor_ledger_entries(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_brand_created ON public.vendor_ledger_entries(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_shift ON public.vendor_ledger_entries(shift_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_ref ON public.vendor_ledger_entries(reference_type, reference_id);

-- Enable RLS on vendor_ledger_entries
ALTER TABLE public.vendor_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Drop RLS policies if exist for idempotency
DROP POLICY IF EXISTS "Brand staff can manage vendor ledger entries" ON public.vendor_ledger_entries;
DROP POLICY IF EXISTS "Vendors can view their own ledger entries" ON public.vendor_ledger_entries;

-- RLS Policies
CREATE POLICY "Brand staff can manage vendor ledger entries"
ON public.vendor_ledger_entries
FOR ALL
TO authenticated
USING (
    brand_id IN (
        SELECT brand_id FROM public.profiles WHERE id = auth.uid()
    ) OR public.is_super_admin()
);

CREATE POLICY "Vendors can view their own ledger entries"
ON public.vendor_ledger_entries
FOR SELECT
TO authenticated
USING (
    vendor_id IN (
        SELECT vendor_id FROM public.vendor_members 
        WHERE user_id = auth.uid() AND status = 'active'
    )
);

-- 2. Helper function to compute real-time vendor balance
CREATE OR REPLACE FUNCTION public.get_vendor_balance(p_vendor_id UUID)
RETURNS NUMERIC(10, 3)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(SUM(amount), 0.000)
    FROM public.vendor_ledger_entries
    WHERE vendor_id = p_vendor_id;
$$;

-- 3. Atomic POS Checkout Stored Procedure
CREATE OR REPLACE FUNCTION public.process_pos_checkout(
    p_brand_id UUID,
    p_shift_id UUID,
    p_items JSONB,
    p_payments JSONB,
    p_customer_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_order_id UUID;
    v_user_id UUID;
    v_invoice_num INT;
    v_order_number TEXT;
    v_total_amount NUMERIC(10, 3) := 0.000;
    v_item RECORD;
    v_payment RECORD;
    v_vendor_id UUID;
    v_commission_bps INT;
    v_unit_price NUMERIC(10, 3);
    v_quantity INT;
    v_line_total NUMERIC(10, 3);
    v_commission_amount NUMERIC(10, 3);
    v_product_id UUID;
    v_variant_id UUID;
    v_description TEXT;
    v_barcode_scanned TEXT;
    v_items_count INT := 0;
BEGIN
    -- Step 1: Validate Shift
    SELECT * INTO v_shift
    FROM public.pos_shifts
    WHERE id = p_shift_id AND status = 'open';

    IF v_shift.id IS NULL THEN
        RAISE EXCEPTION 'Active POS shift not found or shift is closed (Shift ID: %)', p_shift_id;
    END IF;

    -- Resolve fallback user_id
    v_user_id := COALESCE(
        p_created_by,
        p_customer_id,
        v_shift.opened_by,
        auth.uid(),
        (SELECT id FROM auth.users LIMIT 1)
    );

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID resolution failed for POS order';
    END IF;

    -- Step 2: Validate Items input
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Checkout cart is empty';
    END IF;

    -- Step 3: Calculate total order amount
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        unit_price NUMERIC(10, 3),
        quantity INT
    ) LOOP
        v_total_amount := v_total_amount + (v_item.unit_price * COALESCE(v_item.quantity, 1));
    END LOOP;

    -- Step 4: Insert Order
    INSERT INTO public.orders (
        id,
        user_id,
        brand_id,
        total,
        subtotal,
        status,
        payment_status,
        fulfillment_status,
        fulfillment_method,
        payment_method,
        channel,
        customer_id,
        notes,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_user_id,
        p_brand_id,
        v_total_amount,
        v_total_amount,
        'completed',
        'paid',
        'completed',
        'pickup',
        'pos_split',
        'pos',
        p_customer_id,
        p_notes,
        now(),
        now()
    ) RETURNING id, invoice_number INTO v_order_id, v_invoice_num;

    v_order_number := 'POS-' || COALESCE(v_invoice_num::TEXT, (floor(random() * 900000) + 100000)::TEXT);

    -- Step 5: Process Items, Deduct Stock & Write Ledger Entries
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        variant_id UUID,
        quantity INT,
        unit_price NUMERIC(10, 3),
        barcode TEXT,
        description TEXT
    ) LOOP
        v_product_id := v_item.product_id;
        v_variant_id := v_item.variant_id;
        v_quantity := COALESCE(v_item.quantity, 1);
        v_unit_price := v_item.unit_price;
        v_barcode_scanned := v_item.barcode;
        v_line_total := v_unit_price * v_quantity;

        -- Resolve product name / description
        v_description := v_item.description;
        IF v_description IS NULL AND v_product_id IS NOT NULL THEN
            SELECT name INTO v_description
            FROM public.products
            WHERE id = v_product_id;
        END IF;

        IF v_description IS NULL THEN
            v_description := COALESCE(v_barcode_scanned, 'POS Item');
        END IF;

        -- Resolve vendor_id
        v_vendor_id := NULL;
        v_commission_bps := 1000; -- 10% default fallback

        -- 1. Try resolving from product
        IF v_product_id IS NOT NULL THEN
            SELECT vendor_id INTO v_vendor_id
            FROM public.products
            WHERE id = v_product_id;
        END IF;

        -- 2. Try resolving from barcode if vendor_id still null
        IF v_vendor_id IS NULL AND v_barcode_scanned IS NOT NULL THEN
            SELECT vendor_id INTO v_vendor_id
            FROM public.product_barcodes
            WHERE barcode = v_barcode_scanned;
        END IF;

        -- Fetch vendor default commission if vendor resolved
        IF v_vendor_id IS NOT NULL THEN
            SELECT COALESCE(default_commission_bps, 1000) INTO v_commission_bps
            FROM public.vendors
            WHERE id = v_vendor_id;
        END IF;

        -- Calculate commission amount
        v_commission_amount := ROUND((v_line_total * v_commission_bps::NUMERIC) / 10000.0, 3);

        -- Insert into order_items
        INSERT INTO public.order_items (
            id,
            user_id,
            order_id,
            brand_id,
            product_id,
            variant_id,
            description,
            quantity,
            unit_price,
            line_total,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            v_order_id,
            p_brand_id,
            v_product_id,
            v_variant_id,
            v_description,
            v_quantity,
            v_unit_price,
            v_line_total,
            now()
        );

        -- Update Stock if variant exists
        IF v_variant_id IS NOT NULL THEN
            UPDATE public.product_variants
            SET quantity = GREATEST(0, quantity - v_quantity),
                updated_at = now()
            WHERE id = v_variant_id;
        END IF;

        -- Write Vendor Ledger Entries if vendor resolved
        IF v_vendor_id IS NOT NULL THEN
            -- Ledger Entry 1: Credit Vendor for gross item sale
            INSERT INTO public.vendor_ledger_entries (
                brand_id,
                vendor_id,
                shift_id,
                amount,
                type,
                reference_type,
                reference_id,
                description,
                metadata
            ) VALUES (
                p_brand_id,
                v_vendor_id,
                p_shift_id,
                v_line_total,
                'sale',
                'order',
                v_order_id,
                'POS Sale (' || v_order_number || ')',
                jsonb_build_object('product_id', v_product_id, 'variant_id', v_variant_id, 'quantity', v_quantity)
            );

            -- Ledger Entry 2: Debit Vendor for incubator commission
            IF v_commission_amount > 0 THEN
                INSERT INTO public.vendor_ledger_entries (
                    brand_id,
                    vendor_id,
                    shift_id,
                    amount,
                    type,
                    reference_type,
                    reference_id,
                    description,
                    metadata
                ) VALUES (
                    p_brand_id,
                    v_vendor_id,
                    p_shift_id,
                    -v_commission_amount,
                    'commission_deduction',
                    'order',
                    v_order_id,
                    'POS Commission Deduction (' || (v_commission_bps::NUMERIC / 100.0)::TEXT || '%)',
                    jsonb_build_object('commission_bps', v_commission_bps, 'line_total', v_line_total)
                );
            END IF;
        END IF;

        v_items_count := v_items_count + 1;
    END LOOP;

    -- Return JSON result
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total_amount', v_total_amount,
        'items_count', v_items_count,
        'created_at', now()
    );
END;
$$;
