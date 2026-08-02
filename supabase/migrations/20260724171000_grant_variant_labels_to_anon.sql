-- Grant SELECT on custom variant label columns to anonymous and authenticated roles
GRANT SELECT (
  variant_label_size_ar,
  variant_label_size_en,
  variant_label_color_ar,
  variant_label_color_en,
  variant_label_fabric_ar,
  variant_label_fabric_en
) ON TABLE public.products TO anon, authenticated;
