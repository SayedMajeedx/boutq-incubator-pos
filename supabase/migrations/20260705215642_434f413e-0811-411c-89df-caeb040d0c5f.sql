
REVOKE ALL ON FUNCTION public.sync_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_order_stock(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.orders_restore_stock_on_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orders_restore_stock_on_delete() TO service_role;
