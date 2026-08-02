-- Enable pg_trgm extension if not already present
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes on English and Arabic names to accelerate partial text lookups
CREATE INDEX IF NOT EXISTS idx_products_search_name ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_name_ar ON public.products USING gin (name_ar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_name_en ON public.products USING gin (name_en gin_trgm_ops);
