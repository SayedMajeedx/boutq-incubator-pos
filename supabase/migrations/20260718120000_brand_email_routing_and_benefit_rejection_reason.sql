-- Brand-scoped email delivery audit and a customer-visible BenefitPay rejection reason.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS benefit_receipt_rejection_reason text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_benefit_receipt_rejection_reason_length;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_benefit_receipt_rejection_reason_length
  CHECK (
    benefit_receipt_rejection_reason IS NULL
    OR char_length(benefit_receipt_rejection_reason) BETWEEN 3 AND 500
  );

CREATE TABLE IF NOT EXISTS public.brand_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('customer', 'admin')),
  recipient text,
  provider text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_email_notifications_brand_created_idx
  ON public.brand_email_notifications (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_email_notifications_order_idx
  ON public.brand_email_notifications (order_id, created_at DESC);

ALTER TABLE public.brand_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_email_notifications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_benefit_payment(p_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders%ROWTYPE;
DECLARE v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'REJECTION_REASON_TOO_LONG';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_key IS NULL THEN
    RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND';
  END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'PAYMENT_ALREADY_APPROVED'; END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'unpaid',
      benefit_receipt_rejected_at = now(),
      benefit_receipt_rejected_by = auth.uid(),
      benefit_receipt_rejection_reason = v_reason,
      benefit_receipt_delete_after = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'rejected', true,
    'object_key', v_order.benefit_receipt_key,
    'reason', v_reason
  );
END;
$$;

-- Keep the old signature from being used without an explanation.
CREATE OR REPLACE FUNCTION public.reject_benefit_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_benefit_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_benefit_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_benefit_payment(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_benefit_payment(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
