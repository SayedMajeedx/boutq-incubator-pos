-- Storefront SEO metadata is intentionally public. The catalog hardening
-- migration uses column-level grants for anon, so newly added columns are not
-- automatically readable even though the active-brand RLS policy allows the
-- row. Expose only the two non-sensitive SEO fields.
GRANT SELECT (meta_title, meta_description)
ON TABLE public.brands
TO anon;

-- Make the additive schema/grant visible to PostgREST immediately after this
-- migration is applied from the SQL editor or CLI.
NOTIFY pgrst, 'reload schema';
