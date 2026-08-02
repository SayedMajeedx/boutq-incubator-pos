-- Keep non-PII dashboard sources in Supabase Realtime. Customers deliberately
-- remain excluded from this publication (see the security migration that
-- removes customer PII from Realtime); the dashboard refreshes that count when
-- an order arrives and has a polling fallback.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
