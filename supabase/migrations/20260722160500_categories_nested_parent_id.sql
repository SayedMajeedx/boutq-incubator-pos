-- Add parent_id column to categories to natively support nested sections/categories
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null;

-- Add comment
comment on column public.categories.parent_id is 'The parent category ID to enable nested sub-categories.';
