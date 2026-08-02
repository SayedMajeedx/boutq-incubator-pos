alter table public.categories
  add column if not exists menu_icon_url text;

comment on column public.categories.menu_icon_url is
  'Optional square icon shown beside this category in storefront navigation menus.';
