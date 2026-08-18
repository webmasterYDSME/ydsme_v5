-- Six-person public bookings with pseudonymous rapid-repeat controls.

alter table public.event_bookings
  add column if not exists booking_device_hash text,
  add column if not exists booking_ip_hash text;

alter table public.event_bookings
  drop constraint if exists event_bookings_device_hash_check,
  drop constraint if exists event_bookings_ip_hash_check;

alter table public.event_bookings
  add constraint event_bookings_device_hash_check
    check (booking_device_hash is null or booking_device_hash ~ '^[0-9a-f]{64}$'),
  add constraint event_bookings_ip_hash_check
    check (booking_ip_hash is null or booking_ip_hash ~ '^[0-9a-f]{64}$');

create index if not exists event_bookings_recent_device_idx
  on public.event_bookings (event_id, booking_device_hash, created_at)
  where booking_device_hash is not null and status in ('confirmed', 'checked_in');

create index if not exists event_bookings_recent_ip_idx
  on public.event_bookings (event_id, booking_ip_hash, created_at)
  where booking_ip_hash is not null and status in ('confirmed', 'checked_in');

create table if not exists public.event_booking_abuse_summary (
  event_id bigint primary key references public.events(id) on delete restrict,
  browser_blocks integer not null default 0 check (browser_blocks >= 0),
  ip_blocks integer not null default 0 check (ip_blocks >= 0),
  both_blocks integer not null default 0 check (both_blocks >= 0),
  last_blocked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_booking_abuse_summary enable row level security;
revoke all on table public.event_booking_abuse_summary from public, anon, authenticated;
grant select, insert, update, delete on table public.event_booking_abuse_summary to service_role;

-- This trigger protects every new insert, including service-role writes, while
-- allowing status-only updates to grandfathered bookings larger than six.
create or replace function public.enforce_event_booking_party_size()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.party_size < 1 or new.party_size > 6 then
    raise exception 'invalid_party_size';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_event_booking_party_size() from public, anon, authenticated;

drop trigger if exists enforce_event_booking_party_size on public.event_bookings;
create trigger enforce_event_booking_party_size
  before insert or update of party_size on public.event_bookings
  for each row execute function public.enforce_event_booking_party_size();

-- Keep the original service-only RPC compatible during rollout, but apply the
-- new per-booking limit even when an older application deployment calls it.
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
  if p_party_size < 1 or p_party_size > 6 then
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

create or replace function public.create_event_booking_v2(
  p_event_id bigint,
  p_lead_name text,
  p_email text,
  p_party_size integer,
  p_reference_code text,
  p_device_hash text,
  p_ip_hash text
)
returns table (
  outcome text,
  booking_id uuid,
  reference_code text,
  available_places integer,
  block_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.events%rowtype;
  reserved_places integer;
  recent_device_places integer := 0;
  recent_ip_places integer := 0;
  normalized_device_hash text := nullif(lower(trim(p_device_hash)), '');
  normalized_ip_hash text := nullif(lower(trim(p_ip_hash)), '');
  device_blocked boolean := false;
  ip_blocked boolean := false;
  risk_reason text;
  inserted_booking public.event_bookings%rowtype;
begin
  if p_party_size < 1 or p_party_size > 6 then
    raise exception 'invalid_party_size';
  end if;
  if normalized_device_hash is not null and normalized_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_abuse_identifier';
  end if;
  if normalized_ip_hash is not null and normalized_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_abuse_identifier';
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

  select
    coalesce(sum(case when normalized_device_hash is not null and booking_device_hash = normalized_device_hash then party_size else 0 end), 0)::integer,
    coalesce(sum(case when normalized_ip_hash is not null and booking_ip_hash = normalized_ip_hash then party_size else 0 end), 0)::integer
  into recent_device_places, recent_ip_places
  from public.event_bookings
  where event_id = p_event_id
    and status in ('confirmed', 'checked_in')
    and created_at >= now() - interval '10 minutes'
    and (
      (normalized_device_hash is not null and booking_device_hash = normalized_device_hash)
      or (normalized_ip_hash is not null and booking_ip_hash = normalized_ip_hash)
    );

  device_blocked := normalized_device_hash is not null and recent_device_places + p_party_size > 12;
  ip_blocked := normalized_ip_hash is not null and recent_ip_places + p_party_size > 12;

  if device_blocked or ip_blocked then
    risk_reason := case
      when device_blocked and ip_blocked then 'both'
      when device_blocked then 'browser'
      else 'ip'
    end;

    insert into public.event_booking_abuse_summary (
      event_id,
      browser_blocks,
      ip_blocks,
      both_blocks,
      last_blocked_at,
      updated_at
    ) values (
      p_event_id,
      case when risk_reason = 'browser' then 1 else 0 end,
      case when risk_reason = 'ip' then 1 else 0 end,
      case when risk_reason = 'both' then 1 else 0 end,
      now(),
      now()
    )
    on conflict (event_id) do update
    set browser_blocks = public.event_booking_abuse_summary.browser_blocks + excluded.browser_blocks,
        ip_blocks = public.event_booking_abuse_summary.ip_blocks + excluded.ip_blocks,
        both_blocks = public.event_booking_abuse_summary.both_blocks + excluded.both_blocks,
        last_blocked_at = excluded.last_blocked_at,
        updated_at = excluded.updated_at;

    return query select
      'blocked'::text,
      null::uuid,
      null::text,
      selected_event.booking_capacity - reserved_places,
      risk_reason;
    return;
  end if;

  insert into public.event_bookings (
    event_id,
    reference_code,
    lead_name,
    email,
    party_size,
    booking_device_hash,
    booking_ip_hash
  ) values (
    p_event_id,
    upper(trim(p_reference_code)),
    trim(p_lead_name),
    lower(trim(p_email)),
    p_party_size,
    normalized_device_hash,
    normalized_ip_hash
  ) returning * into inserted_booking;

  return query select
    'accepted'::text,
    inserted_booking.id,
    inserted_booking.reference_code,
    selected_event.booking_capacity - reserved_places - p_party_size,
    null::text;
end;
$$;

revoke all on function public.create_event_booking_v2(bigint, text, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_event_booking_v2(bigint, text, text, integer, text, text, text)
  to service_role;

-- Extend the existing retention job so pseudonymous booking signals and their
-- aggregate counters follow the same 90-day post-event lifecycle.
create or replace function public.run_dashboard_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  anonymized integer;
  cleared_limits integer;
  cleared_abuse_summaries integer;
begin
  update public.event_bookings eb
  set lead_name = 'Anonymised visitor',
      email = concat('anonymised+', eb.id::text, '@invalid.local'),
      confirmation_email_error = null,
      booking_device_hash = null,
      booking_ip_hash = null,
      anonymized_at = now(),
      updated_at = now()
  from public.events e
  where eb.event_id = e.id
    and eb.anonymized_at is null
    and e.end_date < current_date - 90;
  get diagnostics anonymized = row_count;

  delete from public.event_booking_abuse_summary summary
  using public.events e
  where summary.event_id = e.id
    and e.end_date < current_date - 90;
  get diagnostics cleared_abuse_summaries = row_count;

  delete from public.rate_limits where expires_at < now();
  get diagnostics cleared_limits = row_count;

  return jsonb_build_object(
    'bookings_anonymized', anonymized,
    'booking_abuse_summaries_cleared', cleared_abuse_summaries,
    'rate_limits_cleared', cleared_limits
  );
end;
$$;

revoke all on function public.run_dashboard_retention() from public, anon, authenticated;
grant execute on function public.run_dashboard_retention() to service_role;
