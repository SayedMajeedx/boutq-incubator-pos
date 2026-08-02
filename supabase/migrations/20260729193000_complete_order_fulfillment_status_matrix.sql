-- Keep every status used by the admin, pickup, and courier workflows valid.
-- The earlier refactor omitted READY_FOR_PICKUP from this constraint even
-- though both the admin UI and automated pickup workflow write that value.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_check CHECK (
    upper(coalesce(fulfillment_status, 'ON_HOLD')) IN (
      'UNASSIGNED',
      'ON_HOLD',
      'NEEDS_PACKING',
      'READY_FOR_PICKUP',
      'READY_FOR_DELIVERY',
      'ASSIGNED',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
      'DELIVERED',
      'DELIVERY_FAILED',
      'RETURNED',
      'CANCELLED'
    )
  );

COMMENT ON CONSTRAINT orders_fulfillment_status_check ON public.orders IS
  'Allowed fulfillment states across delivery, store pickup, and legacy courier workflows.';
