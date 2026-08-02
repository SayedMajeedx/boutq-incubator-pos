-- Drop existing constraints safely
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;

-- Create updated constraints allowing uppercase/lowercase, and legacy statuses
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (
  payment_status IN (
    'unpaid', 'paid', 'refunded', 'partially_paid', 'partial',
    'UNPAID', 'PAID', 'REFUNDED', 'PARTIALLY_PAID'
  )
);

ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (
  fulfillment_status IN (
    'unassigned', 'ready_for_delivery', 'assigned', 'out_for_delivery',
    'delivered', 'delivery_failed', 'returned',
    'on_hold', 'needs_packing', 'shipped', 'completed', 'cancelled',
    'ON_HOLD', 'NEEDS_PACKING', 'SHIPPED', 'COMPLETED', 'CANCELLED'
  )
);

-- Set column default for fulfillment_status to 'ON_HOLD'
ALTER TABLE public.orders ALTER COLUMN fulfillment_status SET DEFAULT 'ON_HOLD';

-- Update existing records:
-- map existing PENDING orders with UNPAID to ON_HOLD, and PENDING with PAID to NEEDS_PACKING
UPDATE public.orders
SET fulfillment_status = 'ON_HOLD'
WHERE lower(status) = 'pending' AND (lower(payment_status) = 'unpaid' OR payment_status IS NULL);

UPDATE public.orders
SET fulfillment_status = 'NEEDS_PACKING'
WHERE lower(status) = 'pending' AND lower(payment_status) = 'paid';

-- Create automated trigger function for synchronizing payment_status update to PAID with needs_packing
CREATE OR REPLACE FUNCTION public.trg_orders_payment_fulfillment_sync()
RETURNS trigger AS $$
BEGIN
  -- If payment status becomes PAID (case-insensitive), auto transition fulfillment status to NEEDS_PACKING
  IF (NEW.payment_status IN ('PAID', 'paid')) AND (OLD.payment_status NOT IN ('PAID', 'paid') OR OLD.payment_status IS NULL) THEN
    IF NEW.fulfillment_status IN ('ON_HOLD', 'on_hold', 'unassigned') THEN
      NEW.fulfillment_status := 'NEEDS_PACKING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists
DROP TRIGGER IF EXISTS trg_orders_sync_payment_fulfillment ON public.orders;

-- Create the trigger
CREATE TRIGGER trg_orders_sync_payment_fulfillment
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_payment_fulfillment_sync();
