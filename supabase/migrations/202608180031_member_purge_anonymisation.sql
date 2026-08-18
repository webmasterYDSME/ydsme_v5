-- Phase 4 follow-up: remove direct authorship identifiers before Auth deletion
-- and require privileged/current committee records to be handed over first.

alter table public.committees alter column created_by drop not null;
alter table public.workshops alter column created_by drop not null;
alter table public.participants alter column participant_id drop not null;

create or replace function public.anonymize_member_content_for_purge(
  p_user_id uuid,
  p_claim_token uuid default null,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.users%rowtype;
begin
  select * into v_target
  from public.users
  where id = p_user_id
  for update;

  if not found
    or v_target.membership_status <> 'archived'
    or v_target.legal_hold then
    raise exception 'member_purge_unavailable';
  end if;

  if p_claim_token is not null then
    if v_target.retention_purge_claim_token is distinct from p_claim_token then
      raise exception 'member_purge_claim_invalid';
    end if;
  elsif p_actor_id is not null then
    if not exists (
      select 1
      from public.users u
      join public.user_roles ur on ur.user_id = u.id
      where u.id = p_actor_id
        and u.membership_status = 'active'
        and ur.role = 'administrator'
    ) then
      raise exception 'member_purge_actor_invalid';
    end if;
  else
    raise exception 'member_purge_authorization_missing';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role in ('administrator', 'committee')
  ) or exists (
    select 1 from public.committees where user_id = p_user_id
  ) then
    raise exception 'member_purge_privileged_role';
  end if;

  update public.feeds
  set author_id = null,
      author_name = 'Former member',
      updated_at = now()
  where author_id = p_user_id;

  update public.documents set created_by = null where created_by = p_user_id;
  update public.workshops set created_by = null where created_by = p_user_id;
  update public.participants set participant_id = null where participant_id = p_user_id;
  update public.committees set created_by = null where created_by = p_user_id;

  return true;
end;
$$;

revoke all on function public.anonymize_member_content_for_purge(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.anonymize_member_content_for_purge(uuid, uuid, uuid)
  to service_role;

-- Replace the initial claim function with the complete privileged-role and
-- current-committee exclusions discovered during the data inventory.
create or replace function public.claim_expired_portal_accounts(p_limit integer default 25)
returns table (user_id uuid, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'expired_portal_account_claim_limit_invalid';
  end if;

  return query
  with candidates as (
    select u.id
    from public.users u
    where u.membership_status = 'archived'
      and u.retention_until is not null
      and u.retention_until < now()
      and not u.legal_hold
      and not exists (
        select 1 from public.membership_records mr
        where mr.auth_user_id = u.id and mr.legal_hold
      )
      and not exists (
        select 1 from public.user_roles ur
        where ur.user_id = u.id and ur.role in ('administrator', 'committee')
      )
      and not exists (
        select 1 from public.committees c where c.user_id = u.id
      )
      and (
        u.retention_purge_claim_token is null
        or u.retention_purge_claimed_at < now() - interval '1 hour'
      )
    order by u.retention_until, u.id
    for update of u skip locked
    limit p_limit
  ), claimed as (
    update public.users u
    set retention_purge_claim_token = gen_random_uuid(),
        retention_purge_claimed_at = now(),
        retention_purge_attempts = u.retention_purge_attempts + 1,
        retention_purge_last_attempt_at = now(),
        retention_purge_last_error = null,
        updated_at = now()
    from candidates c
    where u.id = c.id
    returning u.id, u.retention_purge_claim_token
  )
  select claimed.id, claimed.retention_purge_claim_token from claimed;
end;
$$;

revoke all on function public.claim_expired_portal_accounts(integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_portal_accounts(integer)
  to service_role;

-- Preserve the cleanup implementation from migration 030 and wrap it to
-- report the stricter eligibility count without duplicating the whole job.
alter function public.run_dashboard_retention() rename to run_dashboard_retention_core;
revoke all on function public.run_dashboard_retention_core()
  from public, anon, authenticated, service_role;

create or replace function public.run_dashboard_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_ready integer;
begin
  v_result := public.run_dashboard_retention_core();

  select count(*) into v_ready
  from public.users u
  where u.membership_status = 'archived'
    and u.retention_until < now()
    and not u.legal_hold
    and not exists (
      select 1 from public.membership_records mr
      where mr.auth_user_id = u.id and mr.legal_hold
    )
    and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = u.id and ur.role in ('administrator', 'committee')
    )
    and not exists (
      select 1 from public.committees c where c.user_id = u.id
    );

  return jsonb_set(v_result, '{portal_accounts_ready_for_purge}', to_jsonb(v_ready), true);
end;
$$;

revoke all on function public.run_dashboard_retention() from public, anon, authenticated;
grant execute on function public.run_dashboard_retention() to service_role;
