-- Phase 4: Leaser Portal, Rent Auto-Deduction Engine & E-Signatures Migration

-- 1. Function to process automatic rent deduction from vendor sales ledger balance
CREATE OR REPLACE FUNCTION public.process_rent_auto_deduction(p_brand_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice RECORD;
    v_balance NUMERIC(10, 3);
    v_deducted_count INT := 0;
    v_skipped_count INT := 0;
    v_deducted_amount NUMERIC(10, 3) := 0.000;
BEGIN
    FOR v_invoice IN 
        SELECT i.*, v.brand_id
        FROM public.vendor_rent_invoices i
        JOIN public.vendors v ON v.id = i.vendor_id
        WHERE i.status = 'pending'
          AND i.due_date <= CURRENT_DATE
          AND (p_brand_id IS NULL OR v.brand_id = p_brand_id)
        ORDER BY i.due_date ASC
    LOOP
        -- Check vendor current available ledger balance
        v_balance := public.get_vendor_balance(v_invoice.vendor_id);

        -- Deduct if balance is greater than zero
        IF v_balance >= v_invoice.amount THEN
            -- Write negative debit entry in vendor_ledger_entries
            INSERT INTO public.vendor_ledger_entries (
                brand_id,
                vendor_id,
                amount,
                type,
                reference_type,
                reference_id,
                description,
                metadata
            ) VALUES (
                v_invoice.brand_id,
                v_invoice.vendor_id,
                -v_invoice.amount,
                'rent_deduction',
                'rent_invoice',
                v_invoice.id,
                'Auto Rent Deduction for Invoice #' || substring(v_invoice.id::text from 1 for 8),
                jsonb_build_object('invoice_amount', v_invoice.amount, 'previous_balance', v_balance)
            );

            -- Update invoice status
            UPDATE public.vendor_rent_invoices
            SET status = 'deducted_from_sales',
                payment_method = 'ledger_auto_deduction',
                paid_at = now(),
                updated_at = now()
            WHERE id = v_invoice.id;

            v_deducted_count := v_deducted_count + 1;
            v_deducted_amount := v_deducted_amount + v_invoice.amount;
        ELSE
            v_skipped_count := v_skipped_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'deducted_count', v_deducted_count,
        'deducted_amount', v_deducted_amount,
        'skipped_count', v_skipped_count,
        'processed_at', now()
    );
END;
$$;

-- 2. Function to compute comprehensive vendor dashboard stats
CREATE OR REPLACE FUNCTION public.get_vendor_dashboard_stats(p_vendor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC(10, 3) := 0.000;
    v_total_sales NUMERIC(10, 3) := 0.000;
    v_total_commission NUMERIC(10, 3) := 0.000;
    v_total_rent_deducted NUMERIC(10, 3) := 0.000;
    v_total_payouts NUMERIC(10, 3) := 0.000;
    v_active_stock INT := 0;
    v_products_count INT := 0;
    v_contract RECORD;
    v_pending_rent NUMERIC(10, 3) := 0.000;
BEGIN
    -- Balance
    v_balance := public.get_vendor_balance(p_vendor_id);

    -- Ledger Aggregates
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0.000),
        COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0.000),
        COALESCE(SUM(CASE WHEN type = 'rent_deduction' THEN ABS(amount) ELSE 0 END), 0.000),
        COALESCE(SUM(CASE WHEN type = 'payout' THEN ABS(amount) ELSE 0 END), 0.000)
    INTO v_total_sales, v_total_commission, v_total_rent_deducted, v_total_payouts
    FROM public.vendor_ledger_entries
    WHERE vendor_id = p_vendor_id;

    -- Active Products & Stock
    SELECT 
        COUNT(p.id),
        COALESCE(SUM(v.stock_incubator), 0)
    INTO v_products_count, v_active_stock
    FROM public.products p
    LEFT JOIN public.product_variants v ON v.product_id = p.id
    WHERE p.vendor_id = p_vendor_id AND p.is_active = true;

    -- Contract Info
    SELECT * INTO v_contract
    FROM public.vendor_contracts
    WHERE vendor_id = p_vendor_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Pending Rent Invoices
    SELECT COALESCE(SUM(amount), 0.000) INTO v_pending_rent
    FROM public.vendor_rent_invoices
    WHERE vendor_id = p_vendor_id AND status = 'pending';

    RETURN jsonb_build_object(
        'vendor_id', p_vendor_id,
        'current_balance', v_balance,
        'total_sales', v_total_sales,
        'total_commission', v_total_commission,
        'total_rent_deducted', v_total_rent_deducted,
        'total_payouts', v_total_payouts,
        'active_stock', v_active_stock,
        'products_count', v_products_count,
        'pending_rent', v_pending_rent,
        'contract', CASE WHEN v_contract.id IS NOT NULL THEN jsonb_build_object(
            'id', v_contract.id,
            'rack_number', v_contract.rack_number,
            'monthly_rent', v_contract.monthly_rent,
            'commission_bps', v_contract.commission_bps,
            'signature_png_url', v_contract.signature_png_url,
            'status', v_contract.status,
            'start_date', v_contract.start_date,
            'end_date', v_contract.end_date
        ) ELSE NULL END
    );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.process_rent_auto_deduction TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_dashboard_stats TO authenticated, service_role;
