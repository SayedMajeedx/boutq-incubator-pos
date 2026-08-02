-- Brand SEO columns. CMS pages are stored as tenant-scoped JSON objects in
-- business_settings.pages, so their meta_title/meta_description/slug values
-- travel with each page object rather than a non-existent public.pages table.
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS meta_title varchar(70),
  ADD COLUMN IF NOT EXISTS meta_description varchar(160);

ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_meta_title_plain_text;
ALTER TABLE public.brands ADD CONSTRAINT brands_meta_title_plain_text
  CHECK (meta_title IS NULL OR (char_length(meta_title) <= 70 AND meta_title !~ '[<>]'));
ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_meta_description_plain_text;
ALTER TABLE public.brands ADD CONSTRAINT brands_meta_description_plain_text
  CHECK (meta_description IS NULL OR (char_length(meta_description) <= 160 AND meta_description !~ '[<>]'));

COMMENT ON COLUMN public.brands.meta_title IS 'Plain-text SEO and Open Graph title (maximum 70 characters).';
COMMENT ON COLUMN public.brands.meta_description IS 'Plain-text SEO and Open Graph description (maximum 160 characters).';

CREATE OR REPLACE FUNCTION public.sanitize_brand_seo_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.meta_title := NULLIF(left(trim(regexp_replace(regexp_replace(coalesce(NEW.meta_title, ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 70), '');
  NEW.meta_description := NULLIF(left(trim(regexp_replace(regexp_replace(coalesce(NEW.meta_description, ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 160), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_brand_seo_fields_trigger ON public.brands;
CREATE TRIGGER sanitize_brand_seo_fields_trigger
BEFORE INSERT OR UPDATE OF meta_title, meta_description ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.sanitize_brand_seo_fields();

-- Pages live in business_settings.pages JSON. Sanitize their SEO keys on every
-- write so direct API callers receive the same protection as the admin form.
CREATE OR REPLACE FUNCTION public.sanitize_cms_page_seo_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  page jsonb;
  sanitized_pages jsonb := '[]'::jsonb;
  clean_title text;
  clean_description text;
BEGIN
  IF NEW.pages IS NULL OR jsonb_typeof(NEW.pages) <> 'array' THEN
    NEW.pages := '[]'::jsonb;
    RETURN NEW;
  END IF;
  FOR page IN SELECT value FROM jsonb_array_elements(NEW.pages)
  LOOP
    clean_title := left(trim(regexp_replace(regexp_replace(coalesce(page->>'meta_title', ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 70);
    clean_description := left(trim(regexp_replace(regexp_replace(coalesce(page->>'meta_description', ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 160);
    page := jsonb_set(page, '{meta_title}', coalesce(to_jsonb(NULLIF(clean_title, '')), 'null'::jsonb), true);
    page := jsonb_set(page, '{meta_description}', coalesce(to_jsonb(NULLIF(clean_description, '')), 'null'::jsonb), true);
    sanitized_pages := sanitized_pages || jsonb_build_array(page);
  END LOOP;
  NEW.pages := sanitized_pages;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_cms_page_seo_fields_trigger ON public.business_settings;
CREATE TRIGGER sanitize_cms_page_seo_fields_trigger
BEFORE INSERT OR UPDATE OF pages ON public.business_settings
FOR EACH ROW EXECUTE FUNCTION public.sanitize_cms_page_seo_fields();
