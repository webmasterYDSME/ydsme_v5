-- Phase 4: expire archived portal accounts through the Supabase Auth Admin API.
-- SQL owns eligibility, legal-hold checks, durable claims and retries. The
-- secret-protected Edge Function performs the external Auth deletion.

alter table public.announcements
  alter column created_by drop not null;
alter table public.announcements
  drop constraint announcements_created_by_fkey;
alter table public.announcements
  add constraint announcements_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.users
  add column retention_purge_claim_token uuid,
  add column retention_purge_claimed_at timestamptz,
  add column retention_purge_attempts integer not null default 0
    check (retention_purge_attempts >= 0),
  add column retention_purge_last_attempt_at timestamptz,
  add column retention_purge_last_error text
    check (retention_purge_last_error is null or char_length(retention_purge_last_error) <= 500),
  add constraint users_retention_purge_claim_check check (
    (retention_purge_claim_token is null and retention_purge_claimed_at is null)
    or
    (retention_purge_claim_token is not null and retention_purge_claimed_at is not null)
  );

create index users_expired_archived_retention_idx
  on public.users (retention_until, id)
  where membership_status = 'archived' and not legal_hold;

comment on column public.users.retention_purge_claim_token is
  'Short-lived claim held while the maintenance function deletes an expired Auth account.';

create or replace function public.protect_member_retention_purge_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.retention_purge_claim_token is not null and (
    new.membership_status is distinct from old.membership_status
    or new.retention_until is distinct from old.retention_until
    or new.legal_hold is distinct from old.legal_hold
  ) then
    raise exception 'member_retention_purge_in_progress';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_member_retention_purge_claim()
  from public, anon, authenticated;

drop trigger if exists protect_member_retention_purge_claim on public.users;
create trigger protect_member_retention_purge_claim
before update of membership_status, retention_until, legal_hold on public.users
for each row execute function public.protect_member_retention_purge_claim();

-- Retaining access is a documented exception, not an indefinite bypass. A
-- fresh human decision grants another 12 months before review re-opens.
create or replace function public.extend_membermojo_retained_access_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.portal_access_review_decision = 'retain_access'
    and new.portal_access_reviewed_at is not null
    and new.portal_access_reviewed_at is distinct from old.portal_access_reviewed_at then
    new.retention_until := greatest(
      coalesce(new.retention_until, new.portal_access_reviewed_at),
      new.portal_access_reviewed_at + interval '12 months'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.extend_membermojo_retained_access_review()
  from public, anon, authenticated;

drop trigger if exists extend_membermojo_retained_access_review on public.membership_records;
create trigger extend_membermojo_retained_access_review
before update of portal_access_review_decision, portal_access_reviewed_at on public.membership_records
for each row execute function public.extend_membermojo_retained_access_review();

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
        where ur.user_id = u.id and ur.role = 'administrator'
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

create or replace function public.release_expired_portal_account_claim(
  p_user_id uuid,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released public.users%rowtype;
begin
  update public.users
  set retention_purge_claim_token = null,
      retention_purge_claimed_at = null,
      retention_purge_last_error = left(coalesce(nullif(btrim(p_error), ''), 'Auth deletion failed'), 500),
      updated_at = now()
  where id = p_user_id
    and retention_purge_claim_token = p_claim_token
  returning * into v_released;

  if not found then return false; end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state
  ) values (
    null,
    'system',
    'member.retention-purge-failed',
    'member',
    p_user_id::text,
    'Automatic deletion of an expired archived portal account failed and will be retried.',
    jsonb_build_object('attempt', v_released.retention_purge_attempts)
  );
  return true;
end;
$$;

revoke all on function public.release_expired_portal_account_claim(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_expired_portal_account_claim(uuid, uuid, text)
  to service_role;

-- Extend the database-owned retention job. Expired retained access returns to
-- the human queue; expired archived accounts are left for the Auth API worker.
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
  cleared_import_previews integer;
  deleted_membership_records integer;
  reopened_portal_reviews integer;
  pending_portal_reviews integer;
  ready_portal_accounts integer;
  linked_membership_records integer;
  held_membership_records integer;
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

  delete from public.membership_imports
  where status in ('previewed', 'rejected', 'expired')
    and expires_at < now();
  get diagnostics cleared_import_previews = row_count;

  update public.membership_records mr
  set portal_access_review_required = true,
      portal_access_reviewed_at = null,
      portal_access_reviewed_by = null,
      portal_access_review_decision = null,
      portal_access_review_reason = null,
      updated_at = now()
  from public.users u
  where mr.auth_user_id = u.id
    and mr.retention_until < now()
    and not mr.legal_hold
    and u.membership_status <> 'archived'
    and not mr.portal_access_review_required;
  get diagnostics reopened_portal_reviews = row_count;

  delete from public.membership_records
  where retention_until < now()
    and not legal_hold
    and auth_user_id is null;
  get diagnostics deleted_membership_records = row_count;

  select count(*) into pending_portal_reviews
  from public.membership_records
  where portal_access_review_required;

  select count(*) into linked_membership_records
  from public.membership_records
  where retention_until < now()
    and not legal_hold
    and auth_user_id is not null;

  select count(*) into held_membership_records
  from public.membership_records
  where retention_until < now()
    and legal_hold;

  select count(*) into ready_portal_accounts
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
      where ur.user_id = u.id and ur.role = 'administrator'
    );

  return jsonb_build_object(
    'bookings_anonymized', anonymized,
    'booking_abuse_summaries_cleared', cleared_abuse_summaries,
    'rate_limits_cleared', cleared_limits,
    'import_previews_cleared', cleared_import_previews,
    'membership_records_deleted', deleted_membership_records,
    'membership_records_portal_reviews_reopened', reopened_portal_reviews,
    'membership_records_awaiting_portal_review', pending_portal_reviews,
    'membership_records_expired_but_linked', linked_membership_records,
    'membership_records_on_legal_hold', held_membership_records,
    'portal_accounts_ready_for_purge', ready_portal_accounts
  );
end;
$$;

revoke all on function public.run_dashboard_retention() from public, anon, authenticated;
grant execute on function public.run_dashboard_retention() to service_role;

-- The existing Vault values also authenticate this maintenance function.
select cron.schedule(
  'purge-expired-portal-accounts',
  '47 3 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/purge-expired-members',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret_key' limit 1)
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    ) as request_id
  $job$
);
