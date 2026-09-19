-- Website invitations for people brought in by the MemberMojo list import are sent by a background job
-- instead of by an administrator pressing a button repeatedly.
--
-- An administrator starts the run once. A scheduled job then sends a few invitations every five minutes,
-- retries failures, slows down when Supabase Auth's hourly email limit is reached, and stops by itself
-- when everyone has been invited. Invitations cannot go through the email queue because Supabase Auth
-- creates the account and sends the secure link itself.

create table if not exists public.member_invitation_run (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  started_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  finished_at timestamptz,
  last_run_at timestamptz,
  lease_until timestamptz,
  paused_until timestamptz,
  sent integer not null default 0,
  linked integer not null default 0,
  failed integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.member_invitation_run(singleton) values (true) on conflict do nothing;

create table if not exists public.member_invitation_attempts (
  member_id uuid primary key references public.members(id) on delete cascade,
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamptz
);

alter table public.member_invitation_run enable row level security;
alter table public.member_invitation_attempts enable row level security;
revoke all on public.member_invitation_run from public, anon, authenticated;
revoke all on public.member_invitation_attempts from public, anon, authenticated;
grant select, update on public.member_invitation_run to service_role;
grant select, insert, update, delete on public.member_invitation_attempts to service_role;

-- Members that can still be invited: added by an import, an email address, their own contact, no login yet,
-- and fewer than five failed attempts.
create or replace view public.member_invitation_pending
with (security_invoker = true) as
select m.id, m.full_name, m.contact_email, coalesce(a.attempts, 0) as attempts, a.last_attempt_at
from public.members m
left join public.member_invitation_attempts a on a.member_id = m.id
where m.source = 'membermojo_cutover' and m.portal_invitation_status = 'eligible'
  and m.auth_user_id is null and m.contact_role = 'self' and m.anonymized_at is null
  and nullif(btrim(m.contact_email), '') is not null;
revoke all on public.member_invitation_pending from public, anon, authenticated;
grant select on public.member_invitation_pending to service_role;

create or replace function public.member_invitation_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', r.enabled, 'started_at', r.started_at, 'finished_at', r.finished_at, 'last_run_at', r.last_run_at,
    'paused_until', case when r.paused_until > now() then r.paused_until end,
    'sent', r.sent, 'linked', r.linked, 'failed', r.failed, 'last_error', r.last_error,
    'pending', (select count(*) from public.member_invitation_pending where attempts < 5),
    'gave_up', (select count(*) from public.member_invitation_pending where attempts >= 5))
  from public.member_invitation_run r where r.singleton;
$$;

create or replace function public.start_member_invitations(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_pending integer;
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'member_invitations_actor_invalid'; end if;
  -- Starting again also gives people whose invitation failed five times another chance.
  update public.member_invitation_attempts set attempts = 0;
  update public.member_invitation_run set enabled = true, started_at = now(), started_by = p_actor_id, finished_at = null,
    lease_until = null, paused_until = null, sent = 0, linked = 0, failed = 0, last_error = null, updated_at = now()
  where singleton;
  select count(*) into v_pending from public.member_invitation_pending;
  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
  values (p_actor_id, 'administrator', 'membermojo.invitations-started', 'member-import', gen_random_uuid()::text,
    format('Website invitations started for %s people.', v_pending));
  return public.member_invitation_status();
end;
$$;

create or replace function public.pause_member_invitations(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'member_invitations_actor_invalid'; end if;
  update public.member_invitation_run set enabled = false, updated_at = now() where singleton and enabled;
  if found then
    insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
    values (p_actor_id, 'administrator', 'membermojo.invitations-paused', 'member-import', gen_random_uuid()::text, 'Website invitations paused.');
  end if;
  return public.member_invitation_status();
end;
$$;

-- The scheduled job asks first, so two overlapping runs never send the same invitation twice.
create or replace function public.claim_member_invitation_run()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.member_invitation_run
  set lease_until = now() + interval '4 minutes', last_run_at = now(), updated_at = now()
  where singleton and enabled
    and (paused_until is null or paused_until <= now())
    and (lease_until is null or lease_until <= now());
  return found;
end;
$$;

create or replace function public.next_member_invitations(p_limit integer)
returns table (id uuid, full_name text, contact_email text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.full_name, p.contact_email from public.member_invitation_pending p
  where p.attempts < 5
  order by p.last_attempt_at nulls first, p.id
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

-- outcome: sent (new login invited), linked (an existing login was found), blocked_shared, or failed.
create or replace function public.record_member_invitation(p_member_id uuid, p_outcome text, p_auth_user_id uuid, p_error text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_outcome not in ('sent', 'linked', 'blocked_shared', 'failed') then raise exception 'member_invitation_outcome_invalid'; end if;
  if p_outcome = 'failed' then
    insert into public.member_invitation_attempts(member_id, attempts, last_error, last_attempt_at)
    values (p_member_id, 1, left(p_error, 300), now())
    on conflict (member_id) do update set attempts = public.member_invitation_attempts.attempts + 1,
      last_error = excluded.last_error, last_attempt_at = now();
    update public.member_invitation_run set failed = failed + 1, updated_at = now() where singleton;
    return;
  end if;
  update public.members set
    auth_user_id = case when p_outcome = 'blocked_shared' then null else p_auth_user_id end,
    portal_invitation_status = p_outcome, updated_at = now()
  where id = p_member_id and auth_user_id is null and portal_invitation_status = 'eligible';
  delete from public.member_invitation_attempts where member_id = p_member_id;
  update public.member_invitation_run set
    sent = sent + case when p_outcome = 'sent' then 1 else 0 end,
    linked = linked + case when p_outcome = 'linked' then 1 else 0 end,
    updated_at = now()
  where singleton;
end;
$$;

-- Ends a run. If Supabase Auth refused because its hourly email limit was reached, wait before trying again.
-- When nobody is left to invite, the run switches itself off.
create or replace function public.finish_member_invitation_run(p_rate_limited boolean, p_error text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_left integer; v_run public.member_invitation_run%rowtype;
begin
  update public.member_invitation_run set lease_until = null, updated_at = now(),
    paused_until = case when p_rate_limited then now() + interval '15 minutes' else paused_until end,
    last_error = case when p_rate_limited then 'The email sending limit was reached. Trying again in 15 minutes.'
      else nullif(left(p_error, 300), '') end
  where singleton;
  select count(*) into v_left from public.member_invitation_pending where attempts < 5;
  if v_left = 0 then
    update public.member_invitation_run set enabled = false, finished_at = now(), lease_until = null where singleton and enabled
    returning * into v_run;
    if found then
      insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
      values (null, 'system', 'membermojo.invitations-finished', 'member-import', gen_random_uuid()::text,
        format('Website invitations finished: %s invited, %s linked to an existing login, %s could not be sent.', v_run.sent, v_run.linked, v_run.failed));
    end if;
  end if;
  return public.member_invitation_status();
end;
$$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.member_invitation_status()', 'public.start_member_invitations(uuid)', 'public.pause_member_invitations(uuid)',
    'public.claim_member_invitation_run()', 'public.next_member_invitations(integer)',
    'public.record_member_invitation(uuid,text,uuid,text)', 'public.finish_member_invitation_run(boolean,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

-- The scheduled job: the existing automation function gets an "invitations" job.
create or replace function public.request_membership_automation(p_job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_project_url text; v_key text;
begin
  if p_job not in ('lifecycle','commands','invitations') then raise exception 'membership_automation_job_invalid'; end if;
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='maintenance_secret_key' limit 1;
  if nullif(v_project_url,'') is null or nullif(v_key,'') is null then
    raise exception 'membership_automation_not_configured';
  end if;
  return net.http_post(
    url:=rtrim(v_project_url,'/')||'/functions/v1/run-membership-automation',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:=jsonb_build_object('job',p_job,'requested_at',now()),timeout_milliseconds:=30000
  );
end;
$$;
revoke all on function public.request_membership_automation(text) from public, anon, authenticated;
grant execute on function public.request_membership_automation(text) to service_role;

do $$ begin perform cron.unschedule('member-invitations'); exception when others then null; end $$;
select cron.schedule('member-invitations', '*/5 * * * *', $job$select public.request_membership_automation('invitations');$job$);
