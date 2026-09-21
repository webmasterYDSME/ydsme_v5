-- Whether MemberMojo or the website runs membership is a setting an administrator changes, not an
-- environment variable. The setting lives in one row, every switch is written to a history table and to
-- the audit log, and the web app and both edge functions read the same row. If the row cannot be read,
-- everything treats the mode as "membermojo": nothing is charged and nobody is emailed by mistake.

create table if not exists public.membership_mode_settings (
  id boolean primary key default true check (id),
  mode text not null default 'membermojo' check (mode in ('membermojo', 'website')),
  -- When the website last took over. Members who joined or paid on the website after this moment are not
  -- in MemberMojo, so a MemberMojo import must not archive them if the club ever switches back.
  website_since timestamptz,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);
insert into public.membership_mode_settings(id, mode) values (true, 'membermojo') on conflict (id) do nothing;
alter table public.membership_mode_settings enable row level security;
revoke all on public.membership_mode_settings from public, anon, authenticated;
grant select on public.membership_mode_settings to service_role;

create table if not exists public.membership_mode_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  from_mode text not null check (from_mode in ('membermojo', 'website')),
  to_mode text not null check (to_mode in ('membermojo', 'website')),
  reason text not null check (char_length(reason) between 1 and 500),
  checks jsonb,
  cancelled_emails integer not null default 0 check (cancelled_emails >= 0)
);
create index if not exists membership_mode_changes_changed_at_idx on public.membership_mode_changes (changed_at desc);
alter table public.membership_mode_changes enable row level security;
revoke all on public.membership_mode_changes from public, anon, authenticated;
grant select on public.membership_mode_changes to service_role;

create or replace function public.membership_mode()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select s.mode from public.membership_mode_settings s where s.id), 'membermojo');
$$;
revoke all on function public.membership_mode() from public, anon, authenticated;
grant execute on function public.membership_mode() to service_role;

-- The only way to change the mode. The server may read the settings table but not write to it, so this function
-- (which runs with its owner's rights) is the one place a change can be made. Administrators only. Switching back to MemberMojo may also stop the
-- website's queued membership emails, which would be out of date by the time the website took over again.
create or replace function public.set_membership_mode(
  p_actor_id uuid,
  p_mode text,
  p_reason text,
  p_checks jsonb default null,
  p_stop_queued_emails boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_stopped integer := 0;
begin
  if p_mode is null or p_mode not in ('membermojo', 'website') then
    raise exception 'membership_mode_invalid';
  end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = p_actor_id and ur.role = 'administrator') then
    raise exception 'membership_mode_actor_invalid';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'membership_mode_reason_invalid';
  end if;

  select s.mode into v_from from public.membership_mode_settings s where s.id for update;
  if v_from is null then raise exception 'membership_mode_missing'; end if;
  if v_from = p_mode then
    return jsonb_build_object('changed', false, 'mode', v_from, 'stopped_emails', 0);
  end if;

  update public.membership_mode_settings set
    mode = p_mode,
    website_since = case when p_mode = 'website' then now() else website_since end,
    changed_at = now(),
    changed_by = p_actor_id
  where id;

  if p_mode = 'membermojo' and p_stop_queued_emails then
    v_stopped := coalesce(public.cancel_queued_membership_notifications(null, 'bulk'), 0);
  end if;

  insert into public.membership_mode_changes(changed_by, from_mode, to_mode, reason, checks, cancelled_emails)
  values (p_actor_id, v_from, p_mode, v_reason, p_checks, v_stopped);

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, before_state, after_state)
  values (
    p_actor_id, 'administrator', 'membership-mode.changed', 'membership-mode', 'settings',
    case when p_mode = 'website' then 'The website now runs membership' else 'MemberMojo runs membership again' end,
    jsonb_build_object('mode', v_from),
    jsonb_build_object('mode', p_mode, 'reason', left(v_reason, 500), 'stopped_emails', v_stopped)
  );

  return jsonb_build_object('changed', true, 'mode', p_mode, 'stopped_emails', v_stopped);
end;
$$;
revoke all on function public.set_membership_mode(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.set_membership_mode(uuid, text, text, jsonb, boolean) to service_role;

-- The member-list import treats the MemberMojo list as the complete register, so it archives members who
-- are missing from it. That is only true while MemberMojo runs membership. While the website runs it, nobody
-- is archived by an import, and after a switch back the people who joined or paid on the website are kept.
--   keep_website  the website runs membership, or they joined or paid on the website
create or replace function public.membermojo_import_removals(p_rows jsonb)
returns table (
  member_id uuid,
  full_name text,
  email text,
  plan_name text,
  member_state text,
  has_login boolean,
  decision text,
  note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with file as (
    select lower(regexp_replace(btrim(coalesce(item->>'full_name', '')), '\s+', ' ', 'g')) as name,
      coalesce(lower(btrim(coalesce(item->>'email', ''))), '') as email
    from jsonb_array_elements(p_rows) as t(item)
  ), cfg as (
    select public.membership_mode() as mode,
      (select s.website_since from public.membership_mode_settings s where s.id) as website_since
  ), register as (
    select m.*,
      lower(regexp_replace(btrim(m.full_name), '\s+', ' ', 'g')) as norm_name,
      coalesce(lower(btrim(m.contact_email)), '') as norm_email
    from public.members m
    where m.anonymized_at is null and m.effective_state <> 'archived'
  ), flagged as (
    select r.*,
      (select c.mode from cfg c) = 'website' as website_runs,
      (select c.website_since from cfg c) is not null and (
        (r.source <> 'membermojo_cutover' and r.created_at >= (select c.website_since from cfg c))
        or exists (select 1 from public.membership_terms t
          where t.member_id = r.id and t.source <> 'membermojo_cutover' and t.created_at >= (select c.website_since from cfg c))
      ) as website_activity
    from register r
  )
  select r.id, r.full_name, r.contact_email, p.name, r.effective_state, r.auth_user_id is not null,
    case
      when r.website_runs then 'keep_website'
      when r.legal_hold or exists (select 1 from public.users u where u.id = r.auth_user_id and u.legal_hold) then 'keep_hold'
      when r.auth_user_id is not null and (
        exists (select 1 from public.user_roles ur where ur.user_id = r.auth_user_id and ur.role <> 'member')
        or exists (select 1 from public.committees c where c.user_id = r.auth_user_id)) then 'keep_role'
      when r.effective_state in ('suspended', 'payment_review') then 'keep_state'
      when r.website_activity then 'keep_website'
      when exists (select 1 from file f where f.name = r.norm_name) then 'keep_name'
      else 'archive'
    end,
    case
      when r.website_runs then 'The website runs membership, so nobody is archived because they are missing from the list'
      when r.legal_hold or exists (select 1 from public.users u where u.id = r.auth_user_id and u.legal_hold) then 'Legal hold'
      when r.auth_user_id is not null and (
        exists (select 1 from public.user_roles ur where ur.user_id = r.auth_user_id and ur.role <> 'member')
        or exists (select 1 from public.committees c where c.user_id = r.auth_user_id)) then 'Administrator or committee login'
      when r.effective_state = 'suspended' then 'Suspended'
      when r.effective_state = 'payment_review' then 'A payment is being checked'
      when r.website_activity then 'Joined or paid on the website, which MemberMojo does not know about'
      when exists (select 1 from file f where f.name = r.norm_name) then 'The name is in the list with a different email address'
      else null
    end
  from flagged r
  left join public.membership_plans p on p.id = r.current_plan_id
  where not exists (select 1 from file f where f.name = r.norm_name and f.email = r.norm_email)
  order by r.full_name, r.id;
$$;

revoke all on function public.membermojo_import_removals(jsonb) from public, anon, authenticated;
grant execute on function public.membermojo_import_removals(jsonb) to service_role;
