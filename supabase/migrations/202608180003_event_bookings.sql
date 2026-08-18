-- Simple, capacity-limited visitor bookings for public events.

alter table public.events
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists booking_capacity integer;

alter table public.events
  drop constraint if exists events_booking_capacity_check;

alter table public.events
  add constraint events_booking_capacity_check
  check (booking_capacity is null or booking_capacity between 1 and 10000);

create table if not exists public.event_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete restrict,
  reference_code text not null unique,
  lead_name text not null,
  email text not null,
  party_size integer not null check (party_size between 1 and 20),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'checked_in', 'cancelled')),
  confirmation_email_sent_at timestamptz,
  confirmation_email_error text,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_bookings_active_email_unique
  on public.event_bookings (event_id, lower(email))
  where status <> 'cancelled';

create index if not exists event_bookings_event_status_idx
  on public.event_bookings (event_id, status, created_at);

alter table public.event_bookings enable row level security;

revoke all on table public.event_bookings from public, anon, authenticated;
grant select, insert, update, delete on table public.event_bookings to service_role;

create or replace function public.create_event_booking(
  p_event_id bigint,
  p_lead_name text,
  p_email text,
  p_party_size integer,
  p_reference_code text
)
returns table (
  booking_id uuid,
  reference_code text,
  available_places integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.events%rowtype;
  reserved_places integer;
  inserted_booking public.event_bookings%rowtype;
begin
  if p_party_size < 1 or p_party_size > 20 then
    raise exception 'invalid_party_size';
  end if;

  select * into selected_event
  from public.events
  where id = p_event_id
  for update;

  if not found
    or selected_event.event_type <> 'public'::public.event_type
    or not selected_event.booking_enabled
    or selected_event.booking_capacity is null
    or selected_event.end_date < current_date then
    raise exception 'booking_closed';
  end if;

  if exists (
    select 1 from public.event_bookings
    where event_id = p_event_id
      and lower(email) = lower(trim(p_email))
      and status <> 'cancelled'
  ) then
    raise exception 'booking_exists';
  end if;

  select coalesce(sum(party_size), 0)::integer into reserved_places
  from public.event_bookings
  where event_id = p_event_id
    and status in ('confirmed', 'checked_in');

  if reserved_places + p_party_size > selected_event.booking_capacity then
    raise exception 'insufficient_capacity';
  end if;

  insert into public.event_bookings (
    event_id,
    reference_code,
    lead_name,
    email,
    party_size
  ) values (
    p_event_id,
    upper(trim(p_reference_code)),
    trim(p_lead_name),
    lower(trim(p_email)),
    p_party_size
  ) returning * into inserted_booking;

  return query select
    inserted_booking.id,
    inserted_booking.reference_code,
    selected_event.booking_capacity - reserved_places - p_party_size;
end;
$$;

revoke all on function public.create_event_booking(bigint, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_event_booking(bigint, text, text, integer, text)
  to service_role;
