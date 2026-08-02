-- Treat every supported manual BenefitPay alias consistently when generating
-- the automatic approval email event.
CREATE OR REPLACE FUNCTION public.automate_order_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_placed');
    RETURN NEW;
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit',
       'benefitpay',
       'benefit_pay',
       'bank_transfer'
     )
     AND lower(COALESCE(NEW.payment_status, '')) = 'paid'
     AND lower(COALESCE(OLD.payment_status, '')) <> 'paid' THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'benefit_payment_approved'
    );
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit',
       'benefitpay',
       'benefit_pay',
       'bank_transfer'
     )
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'benefit_payment_rejected'
    );
  END IF;

  IF (
    (lower(COALESCE(NEW.status, '')) = 'completed'
      AND lower(COALESCE(OLD.status, '')) <> 'completed')
    OR (
      lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
      AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
    )
  ) THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'order_delivered'
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.automate_order_email_events()
FROM PUBLIC, anon, authenticated;
