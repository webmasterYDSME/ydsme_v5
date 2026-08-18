-- Phase 3B: durable, human portal-access review decisions for ended imported
-- memberships. No Auth user is deleted by this workflow.

alter table public.membership_records
  add column portal_access_reviewed_at timestamptz,
  add column portal_access_reviewed_by uuid references auth.users(id) on delete set null,
  add column portal_access_review_decision text
    check (portal_access_review_decision in ('archive_access', 'retain_access')),
  add column portal_access_review_reason text
    check (portal_access_review_reason is null or char_length(btrim(portal_access_review_reason)) between 10 and 500),
  add constraint membership_records_portal_review_resolution_check check (
    (portal_access_reviewed_at is null and portal_access_review_decision is null and portal_access_review_reason is null)
    or
    (portal_access_reviewed_at is not null and portal_access_review_decision is not null and portal_access_review_reason is not null)
  );

create or replace function public.normalize_membermojo_portal_review_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id is null then
    new.portal_access_review_required := false;
  end if;

  if new.membership_ended_at is distinct from old.membership_ended_at then
    new.portal_access_reviewed_at := null;
    new.portal_access_reviewed_by := null;
    new.portal_access_review_decision := null;
    new.portal_access_review_reason := null;
    if new.membership_ended_at is null then
      new.portal_access_review_required := false;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_membermojo_portal_review_state()
  from public, anon, authenticated;

drop trigger if exists normalize_membermojo_portal_review_state on public.membership_records;
create trigger normalize_membermojo_portal_review_state
before update of auth_user_id, membership_ended_at on public.membership_records
for each row execute function public.normalize_membermojo_portal_review_state();

create or replace function public.resolve_membermojo_portal_access_review(
  p_membership_record_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_reason text
)
returns table (
  membership_record_id uuid,
  portal_user_id uuid,
  review_decision text,
  portal_membership_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record public.membership_records%rowtype;
  v_portal_user public.users%rowtype;
  v_before_status text;
  v_now timestamptz := now();
begin
  if p_decision not in ('archive_access', 'retain_access')
    or p_reason is null
    or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'membermojo_portal_review_invalid';
  end if;

  if not exists (
    select 1
    from public.users u
    join public.user_roles r on r.user_id = u.id
    where u.id = p_actor_id
      and u.membership_status = 'active'
      and r.role = 'administrator'
  ) then
    raise exception 'membermojo_actor_not_administrator';
  end if;

  select * into v_record
  from public.membership_records
  where id = p_membership_record_id
  for update;

  if not found
    or not v_record.portal_access_review_required
    or v_record.membership_ended_at is null
    or v_record.auth_user_id is null then
    raise exception 'membermojo_portal_review_unavailable';
  end if;

  select * into v_portal_user
  from public.users
  where id = v_record.auth_user_id
  for update;
  if not found then
    raise exception 'membermojo_portal_review_unavailable';
  end if;
  v_before_status := v_portal_user.membership_status;

  if p_decision = 'archive_access' then
    if v_record.auth_user_id = p_actor_id then
      raise exception 'membermojo_portal_review_self';
    end if;
    if exists (
      select 1 from public.user_roles
      where user_id = v_record.auth_user_id and role = 'administrator'
    ) then
      raise exception 'membermojo_portal_review_administrator';
    end if;

    update public.users
    set membership_status = 'archived',
        archived_at = coalesce(archived_at, v_now),
        archived_by = p_actor_id,
        retention_until = coalesce(v_record.retention_until, v_now + interval '12 months'),
        updated_at = v_now
    where id = v_record.auth_user_id;
    v_portal_user.membership_status := 'archived';
  end if;

  update public.membership_records
  set portal_access_review_required = false,
      portal_access_reviewed_at = v_now,
      portal_access_reviewed_by = p_actor_id,
      portal_access_review_decision = p_decision,
      portal_access_review_reason = btrim(p_reason),
      updated_at = v_now
  where id = v_record.id;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    before_state,
    after_state
  ) values (
    p_actor_id,
    'administrator',
    'membermojo.portal-access-reviewed',
    'membership_record',
    v_record.id::text,
    case p_decision
      when 'archive_access' then 'Ended membership portal access archived after administrator review.'
      else 'Ended membership portal access retained after administrator review.'
    end,
    jsonb_build_object(
      'portal_access_review_required', true,
      'portal_membership_status', v_before_status
    ),
    jsonb_build_object(
      'decision', p_decision,
      'reason', btrim(p_reason),
      'portal_access_review_required', false,
      'portal_membership_status', case when p_decision = 'archive_access' then 'archived' else v_portal_user.membership_status end
    )
  );

  return query select
    v_record.id,
    v_record.auth_user_id,
    p_decision,
    case when p_decision = 'archive_access' then 'archived' else v_portal_user.membership_status end;
end;
$$;

revoke all on function public.resolve_membermojo_portal_access_review(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_membermojo_portal_access_review(uuid, uuid, text, text)
  to service_role;

comment on function public.resolve_membermojo_portal_access_review(uuid, uuid, text, text) is
  'Records a human decision for linked access after imported membership ends; archive is reversible and Auth is untouched.';
