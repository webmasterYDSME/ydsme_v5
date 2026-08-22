-- Secure dashboard consolidation: fixed roles, lifecycle state, audit history,
-- atomic workshop reservations, webhook idempotency and least-privilege RLS.

-- Application membership is deliberately separate from auth.users. Supabase
-- Auth proves identity; these columns control access to Society resources.
alter table public.users
  add column if not exists membership_status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users drop constraint if exists users_membership_status_check;
alter table public.users add constraint users_membership_status_check
  check (membership_status in ('active', 'suspended', 'archived'));

-- Collapse legacy application roles without changing Supabase Auth itself.
update public.user_roles
set role = 'member'::public.app_role
where role::text in ('moderator', 'read-only-committee');

insert into public.user_roles (user_id, role)
select u.id, 'member'::public.app_role
from public.users u
where not exists (select 1 from public.user_roles ur where ur.user_id = u.id)
on conflict (user_id) do nothing;

create unique index if not exists user_roles_one_per_user_idx
  on public.user_roles (user_id);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  resolved_role text;
begin
  select role::text into resolved_role
  from public.user_roles
  where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(
    claims,
    '{user_role}',
    to_jsonb(coalesce(resolved_role, 'member'))
  );
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- The column is text so removing or renaming an application role never
-- requires mutating an Auth-owned enum or token format.
alter table public.user_roles alter column role drop default;
alter table public.user_roles alter column role type text using role::text;
alter table public.user_roles alter column role set default 'member';
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('member', 'committee', 'administrator'));

do $$
declare
  application_users integer;
  active_administrators integer;
begin
  select count(*)::integer into application_users from public.users;
  select count(*)::integer into active_administrators
  from public.user_roles ur
  join public.users u on u.id = ur.user_id
  where ur.role = 'administrator' and u.membership_status = 'active';
  -- A fresh installation has nobody to lock out and must be able to replay the
  -- complete migration chain before its first administrator is bootstrapped.
  -- Populated upgrades retain the original three-administrator safety gate.
  if application_users > 0 and active_administrators < 3 then
    raise exception 'Expected at least three active administrators before rollout; found %', active_administrators;
  end if;
end;
$$;

-- These surviving legacy policies retain typed dependencies on authorize(),
-- so they must be removed before the obsolete permission enum can be dropped.
drop policy if exists "Enable select for committee and administrator" on public.users;
drop policy if exists "Enable insert for admin" on public.configs;
drop policy if exists "Enable update for admin" on public.configs;
drop policy if exists "Enable delete for admin" on public.committees;
drop policy if exists "Enable insert for admin" on public.committees;
drop policy if exists "Enable update for admin" on public.committees;

drop function if exists public.authorize(public.app_permission);
drop table if exists public.role_permissions;
drop type if exists public.app_permission;
drop type if exists public.app_role;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role = any(allowed_roles)
      and u.membership_status = 'active'
  );
$$;

revoke all on function public.has_app_role(text[]) from public;
grant execute on function public.has_app_role(text[]) to authenticated;

-- Lifecycle fields retain recoverability while keeping old columns compatible.
alter table public.events
  add column if not exists lifecycle_status text not null default 'published',
  add column if not exists booking_mode text not null default 'none',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.events
set booking_mode = case
  when booking_enabled then 'website'
  when nullif(btrim(reservation_link), '') is not null then 'external'
  else 'none'
end;

alter table public.events drop constraint if exists events_lifecycle_status_check;
alter table public.events add constraint events_lifecycle_status_check
  check (lifecycle_status in ('draft', 'published', 'cancelled', 'archived'));
alter table public.events drop constraint if exists events_booking_mode_check;
alter table public.events add constraint events_booking_mode_check
  check (booking_mode in ('none', 'external', 'website'));

alter table public.workshops
  add column if not exists lifecycle_status text not null default 'published',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.workshops drop constraint if exists workshops_lifecycle_status_check;
alter table public.workshops add constraint workshops_lifecycle_status_check
  check (lifecycle_status in ('draft', 'published', 'cancelled', 'archived'));

alter table public.participants
  add column if not exists reservation_status text not null default 'reserved',
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.participants drop constraint if exists participants_reservation_status_check;
alter table public.participants add constraint participants_reservation_status_check
  check (reservation_status in ('reserved', 'cancelled'));

alter table public.documents
  add column if not exists lifecycle_status text not null default 'published',
  add column if not exists version integer not null default 1,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.documents drop constraint if exists documents_lifecycle_status_check;
alter table public.documents add constraint documents_lifecycle_status_check
  check (lifecycle_status in ('published', 'archived'));
alter table public.documents drop constraint if exists documents_version_check;
alter table public.documents add constraint documents_version_check check (version > 0);

alter table public.feeds
  add column if not exists lifecycle_status text not null default 'published',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.feeds drop constraint if exists feeds_lifecycle_status_check;
alter table public.feeds add constraint feeds_lifecycle_status_check
  check (lifecycle_status in ('published', 'archived', 'moderated'));

alter table public.event_bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists anonymized_at timestamptz,
  add column if not exists retention_until timestamptz;

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('member', 'committee', 'administrator', 'system')),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null default '',
  before_state jsonb,
  after_state jsonb
);
create index if not exists audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public, anon, authenticated;
grant select, insert on public.audit_logs to service_role;

create table if not exists public.rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  expires_at timestamptz not null,
  primary key (scope, subject_hash, window_started_at)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_start timestamptz;
  new_attempts integer;
begin
  if p_scope = '' or p_subject_hash = '' or p_max_attempts < 1
    or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (
    scope, subject_hash, window_started_at, attempts, expires_at
  ) values (
    p_scope,
    p_subject_hash,
    window_start,
    1,
    window_start + make_interval(secs => p_window_seconds)
  )
  on conflict (scope, subject_hash, window_started_at)
  do update set attempts = public.rate_limits.attempts + 1
  returning attempts into new_attempts;

  return new_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

-- Atomic workshop reservation. It exposes no participant roster and derives
-- the member identity from the verified Supabase session.
create or replace function public.reserve_workshop_place(p_workshop_id uuid)
returns table (reservation_id bigint, reserved_places integer, available_places integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_workshop public.workshops%rowtype;
  current_count integer;
  selected_reservation public.participants%rowtype;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.users
    where id = current_user_id and membership_status = 'active'
  ) then raise exception 'membership_inactive'; end if;

  select * into selected_workshop
  from public.workshops
  where id = p_workshop_id
  for update;

  if not found or selected_workshop.lifecycle_status <> 'published'
    or selected_workshop.date < current_date then
    raise exception 'workshop_closed';
  end if;

  select count(*)::integer into current_count
  from public.participants
  where reference_id = p_workshop_id and reservation_status = 'reserved';

  select * into selected_reservation
  from public.participants
  where reference_id = p_workshop_id and participant_id = current_user_id;

  if selected_reservation.id is not null and selected_reservation.reservation_status = 'reserved' then
    return query select selected_reservation.id, current_count,
      greatest(selected_workshop.maximum_participants - current_count, 0);
    return;
  end if;

  if current_count >= selected_workshop.maximum_participants then
    raise exception 'workshop_full';
  end if;

  if selected_reservation.id is null then
    insert into public.participants (reference_id, participant_id, reservation_status)
    values (p_workshop_id, current_user_id, 'reserved')
    returning * into selected_reservation;
  else
    update public.participants
    set reservation_status = 'reserved', cancelled_at = null, updated_at = now()
    where id = selected_reservation.id
    returning * into selected_reservation;
  end if;

  return query select selected_reservation.id, current_count + 1,
    greatest(selected_workshop.maximum_participants - current_count - 1, 0);
end;
$$;

create or replace function public.cancel_workshop_place(p_workshop_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.participants
  set reservation_status = 'cancelled', cancelled_at = now(), updated_at = now()
  where reference_id = p_workshop_id
    and participant_id = auth.uid()
    and reservation_status = 'reserved';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.reserve_workshop_place(uuid) from public;
revoke all on function public.cancel_workshop_place(uuid) from public;
grant execute on function public.reserve_workshop_place(uuid) to authenticated;
grant execute on function public.cancel_workshop_place(uuid) to authenticated;

-- Replace permissive legacy policies with explicit fixed-role policies.
drop policy if exists "Can update own user data." on public.users;
drop policy if exists "Can view own user data." on public.users;
drop policy if exists "Enable select for committee and administrator" on public.users;
drop policy if exists ydsme_users_select_own on public.users;
drop policy if exists ydsme_users_update_own on public.users;
drop policy if exists ydsme_users_admin_select on public.users;
create policy ydsme_users_select_own on public.users for select to authenticated
  using (id = auth.uid() and membership_status = 'active');
create policy ydsme_users_update_own on public.users for update to authenticated
  using (id = auth.uid() and membership_status = 'active')
  with check (id = auth.uid() and membership_status = 'active');
create policy ydsme_users_admin_select on public.users for select to authenticated
  using ((select public.has_app_role(array['administrator'])));

drop policy if exists "Enable read access for all authenticated members" on public.participants;
drop policy if exists "Enable delete for users based on user_id" on public.participants;
drop policy if exists ydsme_participants_insert_self on public.participants;
drop policy if exists ydsme_participants_select_self on public.participants;
drop policy if exists ydsme_participants_delete_self on public.participants;
create policy ydsme_participants_select_self on public.participants for select to authenticated
  using (participant_id = auth.uid());
revoke insert, update, delete on public.participants from authenticated;

drop policy if exists "Enable insert for authenticated members" on public.feeds;
drop policy if exists "Enable read access for authenticated members" on public.feeds;
drop policy if exists ydsme_feeds_delete on public.feeds;
drop policy if exists ydsme_feeds_read_active on public.feeds;
drop policy if exists ydsme_feeds_insert_message on public.feeds;
drop policy if exists ydsme_feeds_archive on public.feeds;
create policy ydsme_feeds_read_active on public.feeds for select to authenticated
  using (lifecycle_status = 'published');
create policy ydsme_feeds_insert_message on public.feeds for insert to authenticated
  with check (type = 'message' and author_id = auth.uid() and lifecycle_status = 'published');
create policy ydsme_feeds_archive on public.feeds for update to authenticated
  using (author_id = auth.uid() or (select public.has_app_role(array['committee','administrator'])))
  with check (author_id = auth.uid() or (select public.has_app_role(array['committee','administrator'])));
revoke insert, update, delete on public.feeds from authenticated;

drop policy if exists "Enable read access for all members" on public.documents;
drop policy if exists ydsme_documents_member_read on public.documents;
create policy ydsme_documents_member_read on public.documents for select to authenticated
  using (lifecycle_status = 'published');

drop policy if exists "Enable read access for all members" on public.workshops;
drop policy if exists ydsme_workshops_member_read on public.workshops;
create policy ydsme_workshops_member_read on public.workshops for select to authenticated
  using (lifecycle_status <> 'archived');

drop policy if exists ydsme_events_public_read on public.events;
drop policy if exists ydsme_events_member_read on public.events;
create policy ydsme_events_public_read on public.events for select to anon
  using (event_type = 'public' and lifecycle_status = 'published');
create policy ydsme_events_member_read on public.events for select to authenticated
  using (lifecycle_status <> 'archived');

drop policy if exists "Enable insert for admin" on public.configs;
drop policy if exists "Enable read access for all users" on public.configs;
drop policy if exists "Enable update for admin" on public.configs;
drop policy if exists ydsme_configs_admin_read on public.configs;
drop policy if exists ydsme_configs_admin_write on public.configs;
create policy ydsme_configs_admin_read on public.configs for select to authenticated
  using ((select public.has_app_role(array['administrator'])));
create policy ydsme_configs_admin_write on public.configs for all to authenticated
  using ((select public.has_app_role(array['administrator'])))
  with check ((select public.has_app_role(array['administrator'])));

drop policy if exists "Enable delete for admin" on public.committees;
drop policy if exists "Enable insert for admin" on public.committees;
drop policy if exists "Enable update for admin" on public.committees;
drop policy if exists ydsme_committees_admin_write on public.committees;
create policy ydsme_committees_admin_write on public.committees for all to authenticated
  using ((select public.has_app_role(array['administrator'])))
  with check ((select public.has_app_role(array['administrator'])));

-- Table privileges mirror RLS rather than relying on historical broad grants.
revoke insert, update, delete, truncate on public.configs from anon;
revoke insert, update, delete, truncate on public.committees from anon;
revoke insert, update, delete, truncate on public.feeds from anon;
revoke insert, update, delete, truncate on public.documents from anon;
revoke insert, update, delete, truncate on public.workshops from anon;
revoke insert, update, delete, truncate on public.participants from anon;

-- The server-side public DTO layer reads config using service_role; raw config
-- JSON is no longer exposed to anonymous clients.
revoke select on public.configs from anon;
revoke update on public.users from authenticated;

-- Retention helper called by a secret-protected scheduled route.
create or replace function public.run_dashboard_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare anonymized integer; cleared_limits integer;
begin
  update public.event_bookings eb
  set lead_name = 'Anonymised visitor',
      email = concat('anonymised+', eb.id::text, '@invalid.local'),
      confirmation_email_error = null,
      anonymized_at = now(),
      updated_at = now()
  from public.events e
  where eb.event_id = e.id
    and eb.anonymized_at is null
    and e.end_date < current_date - 90;
  get diagnostics anonymized = row_count;

  delete from public.rate_limits where expires_at < now();
  get diagnostics cleared_limits = row_count;
  return jsonb_build_object('bookings_anonymized', anonymized, 'rate_limits_cleared', cleared_limits);
end;
$$;

revoke all on function public.run_dashboard_retention() from public, anon, authenticated;
grant execute on function public.run_dashboard_retention() to service_role;
