ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_label_size_ar text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_size_en text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_color_ar text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_color_en text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_fabric_ar text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_fabric_en text DEFAULT NULL;

-- Refresh select grants for public access on products
GRANT SELECT (
  variant_label_size_ar,
  variant_label_size_en,
  variant_label_color_ar,
  variant_label_color_en,
  variant_label_fabric_ar,
  variant_label_fabric_en
) ON public.products TO anon, authenticated;
