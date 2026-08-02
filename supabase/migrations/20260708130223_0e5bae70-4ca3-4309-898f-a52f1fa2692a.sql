
-- 1. Column-level grants for anon on public-facing tables

REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.product_variants FROM anon;
REVOKE ALL ON public.business_settings FROM anon;

GRANT SELECT (id, brand_id, name, description, category, image_url, media, is_active)
  ON public.products TO anon;

GRANT SELECT (id, product_id, brand_id, size, color, fabric, selling_price, stock_main)
  ON public.product_variants TO anon;

GRANT SELECT (
  brand_id, business_name, logo_url, currency,
  primary_color, text_color, background_color,
  font_family, font_url,
  cod_enabled, card_enabled, benefit_enabled, benefit_qr_url,
  footer_note
) ON public.business_settings TO anon;

-- 2. Lock down SECURITY DEFINER functions from anonymous execution.
--    Only the storefront checkout RPC stays callable by anon.

REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_brand_id()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_brand_id()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_customer_address_brand_id()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_order_item_brand_id()                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active()                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_brand_admin()                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.orders_restore_stock_on_delete()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin()                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_order_stock(uuid)                          FROM PUBLIC, anon;

-- Ensure authenticated users retain access to helpers used by RLS policies / app logic
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_brand_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_brand_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_stock(uuid)      TO authenticated;

-- Keep the storefront checkout RPC callable by anonymous shoppers
GRANT EXECUTE ON FUNCTION public.place_storefront_order(text, jsonb, jsonb, text, text)
  TO anon, authenticated;
