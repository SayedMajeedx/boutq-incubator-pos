-- Preserve the baseline price on each order line for historical invoices.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS original_price numeric(14,3)
  CHECK (original_price IS NULL OR original_price >= 0);

UPDATE public.order_items AS oi
SET original_price = pv.original_price
FROM public.product_variants AS pv
WHERE oi.variant_id = pv.id
  AND oi.original_price IS NULL
  AND pv.original_price IS NOT NULL;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_original_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NEW.original_price IS NULL THEN
    SELECT pv.original_price INTO NEW.original_price
    FROM public.product_variants AS pv
    WHERE pv.id = NEW.variant_id AND pv.brand_id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_order_item_original_price_trigger ON public.order_items;
CREATE TRIGGER snapshot_order_item_original_price_trigger
BEFORE INSERT OR UPDATE OF variant_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_original_price();

NOTIFY pgrst, 'reload schema';
