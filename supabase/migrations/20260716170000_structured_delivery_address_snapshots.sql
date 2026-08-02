-- Add map-ready address fields without changing or deleting existing addresses.
alter table public.customer_addresses
  add column if not exists floor text,
  add column if not exists landmark text,
  add column if not exists formatted_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id text;

alter table public.orders
  add column if not exists delivery_address_snapshot jsonb;

create or replace function public.capture_order_delivery_address_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address public.customer_addresses%rowtype;
begin
  if new.fulfillment_method is distinct from 'delivery' or new.shipping_address_id is null then
    new.delivery_address_snapshot := null;
    return new;
  end if;

  -- Preserve an existing historical snapshot unless the selected address changes.
  if tg_op = 'UPDATE'
     and new.shipping_address_id is not distinct from old.shipping_address_id
     and new.customer_id is not distinct from old.customer_id
     and new.brand_id is not distinct from old.brand_id
     and old.delivery_address_snapshot is not null then
    new.delivery_address_snapshot := old.delivery_address_snapshot;
    return new;
  end if;

  select * into v_address
  from public.customer_addresses
  where id = new.shipping_address_id
    and brand_id = new.brand_id
    and customer_id = new.customer_id;

  if not found then
    raise exception 'The selected delivery address does not belong to this customer and brand.';
  end if;

  new.delivery_address_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'id', v_address.id,
    'label', v_address.label,
    'region', v_address.region,
    'block', v_address.block,
    'road', v_address.road,
    'house', v_address.house,
    'flat', v_address.flat,
    'floor', v_address.floor,
    'landmark', v_address.landmark,
    'delivery_notes', v_address.delivery_notes,
    'formatted_address', v_address.formatted_address,
    'latitude', v_address.latitude,
    'longitude', v_address.longitude,
    'place_id', v_address.place_id
  ));
  return new;
end;
$$;

drop trigger if exists capture_order_delivery_address_snapshot on public.orders;
create trigger capture_order_delivery_address_snapshot
before insert or update of shipping_address_id, fulfillment_method, customer_id, brand_id
on public.orders
for each row execute function public.capture_order_delivery_address_snapshot();

-- Populate historical orders once. Future customer-address edits cannot alter this copy.
update public.orders o
set delivery_address_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'schema_version', 1,
  'id', a.id,
  'label', a.label,
  'region', a.region,
  'block', a.block,
  'road', a.road,
  'house', a.house,
  'flat', a.flat,
  'floor', a.floor,
  'landmark', a.landmark,
  'delivery_notes', a.delivery_notes,
  'formatted_address', a.formatted_address,
  'latitude', a.latitude,
  'longitude', a.longitude,
  'place_id', a.place_id
))
from public.customer_addresses a
where o.shipping_address_id = a.id
  and o.fulfillment_method = 'delivery'
  and o.delivery_address_snapshot is null;
