-- Public, tenant-scoped analytics identifiers. These are intentionally not secrets.
create table if not exists public.brand_tracking_settings (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  google_analytics_enabled boolean not null default false,
  google_analytics_id text,
  meta_pixel_enabled boolean not null default false,
  meta_pixel_id text,
  consent_required boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint brand_tracking_ga4_format check (
    google_analytics_id is null or google_analytics_id ~ '^G-[A-Z0-9]+$'
  ),
  constraint brand_tracking_meta_format check (
    meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{5,30}$'
  )
);

alter table public.brand_tracking_settings enable row level security;

drop policy if exists "Public can read active brand tracking" on public.brand_tracking_settings;
create policy "Public can read active brand tracking"
on public.brand_tracking_settings for select
to anon, authenticated
using (exists (
  select 1 from public.brands b where b.id = brand_id and b.is_active = true
));

drop policy if exists "Brand admins manage tracking" on public.brand_tracking_settings;
create policy "Brand admins manage tracking"
on public.brand_tracking_settings for all
to authenticated
using (public.is_admin() and public.can_access_brand(brand_id))
with check (public.is_admin() and public.can_access_brand(brand_id));

grant select on public.brand_tracking_settings to anon, authenticated;
grant insert, update, delete on public.brand_tracking_settings to authenticated;

create or replace function public.touch_brand_tracking_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.google_analytics_id = nullif(upper(trim(new.google_analytics_id)), '');
  new.meta_pixel_id = nullif(trim(new.meta_pixel_id), '');
  return new;
end;
$$;

drop trigger if exists touch_brand_tracking_settings on public.brand_tracking_settings;
create trigger touch_brand_tracking_settings
before insert or update on public.brand_tracking_settings
for each row execute function public.touch_brand_tracking_settings();

notify pgrst, 'reload schema';
