-- Remove the isolated promotion created during the production launch audit.
DELETE FROM public.promo_codes AS promo
WHERE upper(promo.code) = 'CODEX5LIVE'
  AND EXISTS (
    SELECT 1
    FROM public.brands AS brand
    WHERE brand.id = promo.brand_id
      AND brand.slug = 'pura'
  );
