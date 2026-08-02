ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_template text NOT NULL DEFAULT 'modern'
    CHECK (invoice_template IN ('modern', 'classic', 'minimal')),
  ADD COLUMN IF NOT EXISTS invoice_secondary_color text,
  ADD COLUMN IF NOT EXISTS invoice_show_business_details boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_customer_contact boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_fulfillment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_notes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_title_en text,
  ADD COLUMN IF NOT EXISTS invoice_title_ar text;
