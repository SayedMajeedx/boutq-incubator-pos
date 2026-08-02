-- Pura-only Meta WhatsApp Cloud API foundation.
-- The integration and every template remain disabled until Meta production
-- setup is complete. Other tenants are intentionally unaffected.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_transactional_opt_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta' CHECK (provider = 'meta'),
  enabled boolean NOT NULL DEFAULT false,
  waba_id text,
  phone_number_id text UNIQUE,
  business_phone text,
  display_name text,
  graph_api_version text NOT NULL DEFAULT 'v23.0',
  default_language text NOT NULL DEFAULT 'ar' CHECK (default_language IN ('ar', 'en')),
  last_inbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'order_placed',
    'benefit_payment_approved',
    'benefit_payment_rejected',
    'ready_for_pickup',
    'out_for_delivery',
    'order_delivered',
    'order_picked_up'
  )),
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  meta_template_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, event_type, language)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  recipient text NOT NULL,
  template_name text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'accepted', 'sent', 'delivered', 'read', 'failed', 'dead'
  )),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text UNIQUE,
  provider_status_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (order_id, event_type, recipient, language)
);

CREATE INDEX IF NOT EXISTS whatsapp_outbox_retry_idx
  ON public.whatsapp_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  event_key text PRIMARY KEY,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  event_kind text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_integrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_integrations TO service_role;
GRANT ALL ON public.whatsapp_templates TO service_role;
GRANT ALL ON public.whatsapp_outbox TO service_role;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;

INSERT INTO public.whatsapp_integrations (brand_id)
SELECT id
FROM public.brands
WHERE slug = 'pura'
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO public.whatsapp_templates (
  brand_id, event_type, language, meta_template_name, active
)
SELECT
  b.id,
  seed.event_type,
  seed.language,
  seed.meta_template_name,
  false
FROM public.brands b
CROSS JOIN (
  VALUES
    ('order_placed', 'ar', 'pura_order_received_ar'),
    ('order_placed', 'en', 'pura_order_received_en'),
    ('benefit_payment_approved', 'ar', 'pura_payment_approved_ar'),
    ('benefit_payment_approved', 'en', 'pura_payment_approved_en'),
    ('benefit_payment_rejected', 'ar', 'pura_payment_rejected_ar'),
    ('benefit_payment_rejected', 'en', 'pura_payment_rejected_en'),
    ('ready_for_pickup', 'ar', 'pura_ready_for_pickup_ar'),
    ('ready_for_pickup', 'en', 'pura_ready_for_pickup_en'),
    ('out_for_delivery', 'ar', 'pura_out_for_delivery_ar'),
    ('out_for_delivery', 'en', 'pura_out_for_delivery_en'),
    ('order_delivered', 'ar', 'pura_order_delivered_ar'),
    ('order_delivered', 'en', 'pura_order_delivered_en'),
    ('order_picked_up', 'ar', 'pura_order_picked_up_ar'),
    ('order_picked_up', 'en', 'pura_order_picked_up_en')
) AS seed(event_type, language, meta_template_name)
WHERE b.slug = 'pura'
ON CONFLICT (brand_id, event_type, language) DO NOTHING;

CREATE OR REPLACE FUNCTION public.normalize_whatsapp_recipient(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_value, ''), '[^0-9]', '', 'g');
BEGIN
  IF length(v_digits) = 8 THEN
    v_digits := '973' || v_digits;
  ELSIF left(v_digits, 2) = '00' THEN
    v_digits := substring(v_digits FROM 3);
  END IF;
  IF length(v_digits) < 8 OR length(v_digits) > 15 THEN
    RETURN NULL;
  END IF;
  RETURN v_digits;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_whatsapp_recipient(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_whatsapp_recipient(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_order_whatsapp_event(
  p_order_id uuid,
  p_event_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_integration public.whatsapp_integrations%ROWTYPE;
  v_template public.whatsapp_templates%ROWTYPE;
  v_recipient text;
  v_customer_name text;
BEGIN
  SELECT o.*
  INTO v_order
  FROM public.orders o
  JOIN public.brands b ON b.id = o.brand_id
  WHERE o.id = p_order_id
    AND b.slug = 'pura'
    AND o.whatsapp_transactional_opt_in_at IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT *
  INTO v_integration
  FROM public.whatsapp_integrations
  WHERE brand_id = v_order.brand_id
    AND enabled = true
    AND provider = 'meta'
    AND phone_number_id IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT *
  INTO v_template
  FROM public.whatsapp_templates
  WHERE brand_id = v_order.brand_id
    AND event_type = p_event_type
    AND language = v_integration.default_language
    AND active = true;

  IF NOT FOUND THEN RETURN; END IF;

  v_recipient := public.normalize_whatsapp_recipient(v_order.customer_phone_snapshot);
  IF v_recipient IS NULL THEN RETURN; END IF;

  v_customer_name := COALESCE(NULLIF(trim(v_order.customer_name_snapshot), ''), 'Customer');

  INSERT INTO public.whatsapp_outbox (
    brand_id,
    order_id,
    event_type,
    language,
    recipient,
    template_name,
    parameters
  ) VALUES (
    v_order.brand_id,
    v_order.id,
    p_event_type,
    v_template.language,
    v_recipient,
    v_template.meta_template_name,
    jsonb_build_array(
      v_customer_name,
      v_order.invoice_number::text,
      concat(v_order.currency, ' ', to_char(v_order.total, 'FM999999990.000'))
    )
  )
  ON CONFLICT (order_id, event_type, recipient, language) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_whatsapp_event(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_order_whatsapp_event(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_order_whatsapp_opt_in(
  p_order_id uuid,
  p_confirmation_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.orders o
  SET whatsapp_transactional_opt_in_at = COALESCE(
        whatsapp_transactional_opt_in_at,
        now()
      )
  FROM public.brands b
  WHERE o.id = p_order_id
    AND o.brand_id = b.id
    AND b.slug = 'pura'
    AND o.confirmation_email_token = p_confirmation_token;

  v_updated := FOUND;
  IF v_updated THEN
    PERFORM public.enqueue_order_whatsapp_event(p_order_id, 'order_placed');
  END IF;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_order_whatsapp_opt_in(uuid, uuid)
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.automate_order_whatsapp_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.whatsapp_transactional_opt_in_at IS NULL THEN RETURN NEW; END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND lower(COALESCE(NEW.payment_status, '')) = 'paid'
     AND lower(COALESCE(OLD.payment_status, '')) <> 'paid' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_approved');
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_rejected');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND lower(COALESCE(NEW.fulfillment_status, '')) = 'ready_for_pickup'
     AND lower(COALESCE(OLD.fulfillment_status, '')) <> 'ready_for_pickup' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'ready_for_pickup');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) <> 'pickup'
     AND lower(COALESCE(NEW.fulfillment_status, '')) IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     ) THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'out_for_delivery');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('picked_up', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('picked_up', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_picked_up');
  ELSIF lower(COALESCE(NEW.fulfillment_method, '')) <> 'pickup'
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_delivered');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automate_order_whatsapp_events ON public.orders;
CREATE TRIGGER automate_order_whatsapp_events
AFTER UPDATE OF status, payment_status, fulfillment_status, benefit_receipt_rejected_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.automate_order_whatsapp_events();

REVOKE ALL ON FUNCTION public.automate_order_whatsapp_events()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automate_order_whatsapp_events() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox_event(p_event_id uuid)
RETURNS TABLE (
  event_id uuid,
  brand_id uuid,
  recipient text,
  template_name text,
  language text,
  parameters jsonb,
  phone_number_id text,
  graph_api_version text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.whatsapp_outbox o
    SET status = 'processing',
        attempts = attempts + 1,
        last_error = NULL,
        updated_at = now()
    FROM public.whatsapp_integrations i, public.brands b
    WHERE o.id = p_event_id
      AND o.brand_id = i.brand_id
      AND b.id = o.brand_id
      AND b.slug = 'pura'
      AND i.enabled = true
      AND i.phone_number_id IS NOT NULL
      AND o.status IN ('pending', 'failed')
      AND o.attempts < 5
      AND o.next_attempt_at <= now()
    RETURNING o.id, o.brand_id, o.recipient, o.template_name,
              o.language, o.parameters, i.phone_number_id,
              i.graph_api_version
  )
  SELECT * FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_outbox_event(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbox_event(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_whatsapp_delivery_status(
  p_provider_message_id text,
  p_status text,
  p_status_at timestamptz,
  p_error text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_normalized text := lower(COALESCE(p_status, ''));
BEGIN
  IF v_normalized NOT IN ('accepted', 'sent', 'delivered', 'read', 'failed') THEN
    RETURN NULL;
  END IF;

  UPDATE public.whatsapp_outbox o
  SET
    status = CASE
      WHEN v_normalized = 'failed' THEN 'failed'
      WHEN (
        CASE o.status
          WHEN 'read' THEN 4
          WHEN 'delivered' THEN 3
          WHEN 'sent' THEN 2
          WHEN 'accepted' THEN 1
          ELSE 0
        END
      ) <= (
        CASE v_normalized
          WHEN 'read' THEN 4
          WHEN 'delivered' THEN 3
          WHEN 'sent' THEN 2
          WHEN 'accepted' THEN 1
          ELSE 0
        END
      ) THEN v_normalized
      ELSE o.status
    END,
    provider_status_at = GREATEST(
      COALESCE(o.provider_status_at, '-infinity'::timestamptz),
      COALESCE(p_status_at, now())
    ),
    last_error = CASE
      WHEN v_normalized = 'failed' THEN NULLIF(p_error, '')
      ELSE o.last_error
    END,
    updated_at = now()
  WHERE o.provider_message_id = p_provider_message_id
  RETURNING o.id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_whatsapp_delivery_status(
  text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_delivery_status(
  text, text, timestamptz, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
