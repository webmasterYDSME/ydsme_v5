-- Two things the daily job did not do before:
--
-- 1. Retention. The Privacy Policy keeps the core membership record for up to 12 months after
--    membership ends. A member is now anonymised 12 months after 31 December of the last year
--    they paid for (or 12 months after the record was created, if they never paid). A warning
--    email goes out about a month before. Nothing is warned or anonymised until an
--    administrator switches the schedule on, after checking the preview list.
--
-- 2. Renewal reminders. Four reminders on fixed dates (1 December, 1 January, 1 February and
--    22 February) go to invited members who have not paid, from the same daily job.

-- ---------------------------------------------------------------------------------------------
-- Retention: the switch
-- ---------------------------------------------------------------------------------------------

create table if not exists public.membership_retention_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null,
  last_run_on date,
  last_result jsonb
);
insert into public.membership_retention_settings(singleton) values (true) on conflict do nothing;
alter table public.membership_retention_settings enable row level security;
revoke all on public.membership_retention_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Retention: who is affected, and what would happen to them on p_today
-- ---------------------------------------------------------------------------------------------

create or replace function public.membership_retention_candidates(
  p_today date default (now() at time zone 'Europe/London')::date,
  p_horizon_days integer default 62
)
returns table (
  member_id uuid,
  full_name text,
  contact_email text,
  effective_state text,
  basis text,
  last_paid_year integer,
  retain_until date,
  warned_at timestamptz,
  blocked_reason text,
  action text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select m.id, m.full_name, m.contact_email, m.guardian_email, m.effective_state, m.auth_user_id,
      m.legal_hold, m.retention_until, m.created_at, m.legacy_membership_record_id,
      (select max(t.membership_year) from public.membership_terms t
        where t.member_id = m.id and (t.status = 'paid' or t.amount_paid_pence > 0)) as paid_year,
      (select max(extract(year from h.revoked_effective_on - 1)::integer) from public.honorary_memberships h
        where h.member_id = m.id and h.status = 'revoked' and h.revoked_effective_on is not null) as honorary_year
    from public.members m
    where m.anonymized_at is null
      and m.effective_state in ('lapsed', 'archived', 'suspended', 'payment_review')
  ), dated as (
    select b.*,
      greatest(b.paid_year, b.honorary_year) as covered_year,
      greatest(
        case when greatest(b.paid_year, b.honorary_year) is not null
          then make_date(greatest(b.paid_year, b.honorary_year) + 1, 12, 31)
          else ((b.created_at at time zone 'Europe/London')::date + interval '12 months')::date end,
        (b.retention_until at time zone 'Europe/London')::date
      ) as due
    from base b
  ), checked as (
    select d.*,
      (select max(n.created_at) from public.membership_notifications n
        where n.member_id = d.id and n.kind = 'membership.retention-warning'
          and n.deduplication_key = 'retention-warning-' || d.id || '-' || d.due) as warned,
      (d.contact_email is not null or d.guardian_email is not null) as contactable,
      case
        when d.legal_hold
          or exists (select 1 from public.users u where u.id = d.auth_user_id and u.legal_hold)
          or exists (select 1 from public.membership_records r where r.id = d.legacy_membership_record_id and r.legal_hold)
          then 'Legal hold'
        when d.auth_user_id is not null and (
            exists (select 1 from public.user_roles ur where ur.user_id = d.auth_user_id and ur.role in ('administrator', 'committee'))
            or exists (select 1 from public.committees c where c.user_id = d.auth_user_id))
          then 'Has an officer or committee role'
        when d.effective_state = 'suspended' then 'Suspended: an officer needs to decide'
        when d.effective_state = 'payment_review'
          or exists (select 1 from public.membership_terms t where t.member_id = d.id and t.status = 'payment_review')
          then 'A payment is waiting to be checked'
        when exists (select 1 from public.membership_checkout_attempts a
            where a.member_id = d.id and a.status in ('failed', 'payment_review') and a.resolved_at is null)
          then 'A payment problem is still open'
        else null
      end as blocked
    from dated d
  )
  select c.id, c.full_name, c.contact_email, c.effective_state,
    case when c.covered_year is not null then 'last_paid_year' else 'created' end,
    c.covered_year, c.due, c.warned, c.blocked,
    case
      when c.blocked is not null then 'blocked'
      when p_today > c.due and (not c.contactable or (c.warned is not null
        and (c.warned at time zone 'Europe/London')::date <= p_today - 28)) then 'anonymise'
      when c.contactable and c.warned is null and p_today >= c.due - 31 then 'warn'
      when c.warned is not null then 'waiting'
      else 'upcoming'
    end
  from checked c
  where c.due <= p_today + p_horizon_days
  order by c.due, c.full_name;
$$;

revoke all on function public.membership_retention_candidates(date, integer) from public, anon, authenticated;
grant execute on function public.membership_retention_candidates(date, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Retention: anonymising one member
-- ---------------------------------------------------------------------------------------------
-- Removes the person from the membership record and from every copy of their details kept next
-- to it (applications, emails sent to them, payment references, contact-change requests). The
-- payment amounts and dates stay, without a name, for the Society's accounts. A website login
-- is not deleted here: the account is archived with its retention date already passed, and the
-- hourly purge deletes it and rewires anything they wrote to "Former member".

create or replace function public.anonymise_membership_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_user public.users%rowtype;
  v_removed text := 'Removed under the retention schedule';
begin
  select * into v_member from public.members where id = p_member_id for update;
  if not found or v_member.anonymized_at is not null or v_member.legal_hold then return false; end if;

  if v_member.auth_user_id is not null then
    select * into v_user from public.users where id = v_member.auth_user_id for update;
    if found then
      if v_user.legal_hold
        or exists (select 1 from public.user_roles ur where ur.user_id = v_user.id and ur.role in ('administrator', 'committee'))
        or exists (select 1 from public.committees c where c.user_id = v_user.id) then
        return false;
      end if;
      update public.users
      set membership_status = 'archived',
          archived_at = coalesce(archived_at, now()),
          retention_until = now() - interval '1 minute',
          updated_at = now()
      where id = v_user.id;
    end if;
  end if;

  update public.members
  set auth_user_id = null, title = '',
      full_name = 'Former member · ' || upper(left(replace(id::text, '-', ''), 8)),
      contact_email = null, contact_number = null, date_of_birth = null,
      guardian_name = null, guardian_email = null, guardian_consent_at = null, guardian_consent_note = null,
      postal_address = null, preferred_contact_method = 'officer', portal_invitation_status = 'not_requested',
      contact_email_verified_at = null, contact_role = 'self',
      newsletter_opt_in = false, newsletter_consent_source = null, newsletter_consent_given_on = null,
      newsletter_consent_recorded_at = null, newsletter_consent_recorded_by_actor_id = null,
      effective_state = 'archived', anonymized_at = now(), updated_at = now()
  where id = p_member_id;

  update public.membership_applications
  set title = '', full_name = 'Former applicant',
      contact_email = 'removed+' || replace(id::text, '-', '') || '@example.invalid',
      contact_number = null, date_of_birth = null, guardian_name = null, guardian_email = null,
      guardian_contact_number = null, guardian_consent = false, review_reason = null,
      verification_token_hash = encode(extensions.digest(id::text || ':removed', 'sha256'), 'hex'),
      guardian_verification_token_hash = null, application_status_token_hash = null,
      retention_anonymized_at = now(), updated_at = now()
  where converted_member_id = p_member_id;

  update public.membership_notifications
  set recipient_email = null, recipient_user_id = null, title = 'Membership notice', body = v_removed,
      action_href = null, portal_visible = false, email_status = 'cancelled', last_email_error = null,
      updated_at = now()
  where member_id = p_member_id;

  delete from public.membership_portal_email_claims where member_id = p_member_id;
  delete from public.membership_renewal_invitations where member_id = p_member_id;

  update public.membership_contact_change_requests
  set requested_email = 'removed@example.invalid',
      token_hash = encode(extensions.digest(id::text || ':removed', 'sha256'), 'hex'),
      reason = null, status = case when status = 'pending' then 'cancelled' else status end
  where member_id = p_member_id;

  update public.honorary_memberships
  set reason = v_removed,
      revocation_reason = case when revocation_reason is not null then v_removed end
  where member_id = p_member_id;

  update public.membership_payments payment
  set notes = null, cash_receipt_reference = null,
      offline_reference = case when payment.offline_reference is not null then 'Removed' end
  from public.membership_terms term
  where payment.term_id = term.id and term.member_id = p_member_id;

  update public.membership_offline_payment_records record
  set payment_reference = case when record.payment_reference is not null then 'Removed' end,
      failure_reason = case when record.failure_reason is not null then v_removed end
  where record.member_id = p_member_id
    or record.term_id in (select term.id from public.membership_terms term where term.member_id = p_member_id);

  update public.membership_plan_transitions
  set reason = v_removed, review_reason = case when review_reason is not null then v_removed end
  where member_id = p_member_id;

  update public.membership_records record
  set auth_user_id = null, title = '', first_name = 'Former', last_name = 'member', contact_email = null,
      updated_at = now()
  from public.members member
  where member.id = p_member_id and record.id = member.legacy_membership_record_id and not record.legal_hold;

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values (null, 'system', 'membership.retention-anonymised', 'member', p_member_id::text,
    'A former member''s personal details were anonymised under the retention schedule.',
    jsonb_build_object('portal_account_scheduled_for_deletion', v_user.id is not null));
  return true;
end;
$$;

revoke all on function public.anonymise_membership_member(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_membership_member(uuid) to service_role;

-- The older launch retention step anonymised archived members with a retention date, but only
-- their own row. It now uses the same full clean-up.
create or replace function public.run_membership_launch_retention(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applications integer := 0;
  v_members integer := 0;
  v_member uuid;
begin
  update public.membership_applications application
  set full_name = 'Former applicant', title = '',
      contact_email = 'expired+' || replace(application.id::text, '-', '') || '@example.invalid',
      contact_number = null, date_of_birth = null, guardian_name = null, guardian_email = null, guardian_consent = false,
      verification_token_hash = encode(extensions.digest(application.id::text || ':expired', 'sha256'), 'hex'),
      guardian_verification_token_hash = null, application_status_token_hash = null,
      retention_anonymized_at = now(), updated_at = now()
  where application.status in ('rejected', 'expired') and application.retention_anonymized_at is null
    and application.updated_at < p_today::timestamptz - interval '90 days';
  get diagnostics v_applications = row_count;

  for v_member in
    select member.id from public.members member
    where member.retention_until is not null and member.retention_until < p_today::timestamptz
      and not member.legal_hold and member.anonymized_at is null and member.effective_state = 'archived'
  loop
    begin
      if public.anonymise_membership_member(v_member) then v_members := v_members + 1; end if;
    exception when others then
      raise warning 'Could not anonymise member %: %', v_member, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('applications', v_applications, 'members', v_members);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Retention: the daily step (warn, then anonymise) - does nothing until switched on
-- ---------------------------------------------------------------------------------------------

create or replace function public.run_membership_retention(
  p_today date default (now() at time zone 'Europe/London')::date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_row record;
  v_member public.members%rowtype;
  v_title text := 'Your YDSME membership record will be removed';
  v_body text;
  v_recipient text;
  v_warned integer := 0;
  v_anonymised integer := 0;
  v_failed integer := 0;
  v_pending_warn integer := 0;
  v_pending_anonymise integer := 0;
  v_result jsonb;
begin
  select enabled into v_enabled from public.membership_retention_settings where singleton;
  select count(*) filter (where action = 'warn'), count(*) filter (where action = 'anonymise')
  into v_pending_warn, v_pending_anonymise
  from public.membership_retention_candidates(p_today, 40);

  if not coalesce(v_enabled, false) then
    v_result := jsonb_build_object('enabled', false, 'would_warn', v_pending_warn, 'would_anonymise', v_pending_anonymise);
    update public.membership_retention_settings set last_run_on = p_today, last_result = v_result where singleton;
    return v_result;
  end if;

  for v_row in
    select * from public.membership_retention_candidates(p_today, 40) where action = 'warn'
  loop
    select * into v_member from public.members where id = v_row.member_id;
    v_recipient := coalesce(v_member.contact_email, v_member.guardian_email);
    v_body := concat_ws(E'\n\n',
      v_row.full_name || ', your membership of the York City & District Society of Model Engineers '
        || case when v_row.basis = 'last_paid_year'
          then 'last covered the year ' || v_row.last_paid_year || '.'
          else 'was never paid for.' end,
      'Under our Privacy Policy we keep your membership record for up to 12 months after your membership ends. '
        || 'After ' || to_char(v_row.retain_until, 'FMDD FMMonth YYYY') || ' we will anonymise it: your name, '
        || 'contact details, date of birth and address will be removed. We keep only the amounts and dates of '
        || 'payments for our accounts, without your name.',
      'If you would like to stay a member, please renew before that date, or reply to this email and the '
        || 'membership officer will keep your record. If you do not want to stay a member, there is nothing '
        || 'you need to do.',
      'This is an automated email.');
    insert into public.membership_notifications(
      member_id, recipient_email, kind, title, body, portal_visible, deduplication_key
    ) values (
      v_row.member_id, v_recipient, 'membership.retention-warning', v_title, v_body, false,
      'retention-warning-' || v_row.member_id || '-' || v_row.retain_until
    ) on conflict (deduplication_key) do nothing;
    if v_member.contact_email is not null and v_member.guardian_email is not null
      and lower(v_member.guardian_email) <> lower(v_member.contact_email) then
      insert into public.membership_notifications(
        member_id, recipient_email, kind, title, body, portal_visible, deduplication_key
      ) values (
        v_row.member_id, v_member.guardian_email, 'membership.retention-warning',
        v_title || ' — guardian copy', 'Guardian copy concerning ' || v_row.full_name || '. ' || v_body, false,
        'retention-warning-' || v_row.member_id || '-' || v_row.retain_until || '-guardian'
      ) on conflict (deduplication_key) do nothing;
    end if;
    v_warned := v_warned + 1;
  end loop;

  for v_row in
    select * from public.membership_retention_candidates(p_today, 40) where action = 'anonymise' limit 25
  loop
    begin
      if public.anonymise_membership_member(v_row.member_id) then v_anonymised := v_anonymised + 1; end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'Could not anonymise member %: %', v_row.member_id, sqlerrm;
    end;
  end loop;

  v_result := jsonb_build_object('enabled', true, 'warned', v_warned, 'anonymised', v_anonymised, 'failed', v_failed);
  update public.membership_retention_settings set last_run_on = p_today, last_result = v_result where singleton;
  return v_result;
end;
$$;

revoke all on function public.run_membership_retention(date) from public, anon, authenticated;
grant execute on function public.run_membership_retention(date) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Renewal reminders: one queueing routine for the officer's button and the daily schedule
-- ---------------------------------------------------------------------------------------------
-- p_stage is 'manual' (the officer's button, one reminder every 7 days at most) or one of the four
-- scheduled stages. Scheduled stages go only to members who are still active or in their grace
-- period; a member who has already lapsed is left to the officer's own reminders, because
-- "your access ends on 1 March" would not be true for them.

create or replace function public.queue_membership_renewal_reminders_core(
  p_year integer,
  p_stage text,
  p_day date,
  p_min_gap_days integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued integer;
begin
  with due as (
    select m.id as member_id, m.full_name, m.contact_email, m.auth_user_id, invitation_notice.action_href
    from public.membership_renewal_invitations i
    join public.members m on m.id = i.member_id
    join public.membership_notifications invitation_notice
      on invitation_notice.deduplication_key = 'renewal-invitation-' || m.id || '-' || p_year
    where i.membership_year = p_year
      and i.expires_at > now()
      and (case when p_stage = 'manual' then m.effective_state in ('active', 'grace', 'lapsed')
                else m.effective_state in ('active', 'grace') end)
      and m.contact_email is not null
      and not public.membership_honorary_covers_year(m.id, p_year)
      and invitation_notice.kind = 'membership.renewal-invitation'
      and invitation_notice.action_href is not null
      and not exists (
        select 1 from public.membership_terms t
        where t.member_id = m.id and t.membership_year = p_year and (t.status = 'paid' or t.amount_paid_pence > 0))
      and not exists (
        select 1 from public.membership_notifications earlier
        where earlier.kind = 'membership.renewal-reminder'
          and starts_with(earlier.deduplication_key, 'renewal-reminder-' || m.id || '-' || p_year || '-')
          and earlier.created_at > now() - make_interval(days => p_min_gap_days))
  ), inserted as (
    insert into public.membership_notifications(
      member_id, recipient_email, recipient_user_id, kind, title, body, action_href, portal_visible, deduplication_key)
    select member_id, contact_email, auth_user_id, 'membership.renewal-reminder',
      case p_stage
        when 'due-soon' then 'Your YDSME ' || p_year || ' membership is due on 1 January'
        when 'due-now' then 'Your YDSME ' || p_year || ' membership is due now'
        when 'one-month' then 'One month left to renew your YDSME membership'
        when 'last-week' then 'Last week to renew your YDSME membership'
        else 'Please renew your YDSME ' || p_year || ' membership' end,
      concat_ws(E'\n\n',
        case p_stage
          when 'due-soon' then full_name || '’s membership for ' || p_year || ' is due for renewal on 1 January ' || p_year || '.'
          when 'due-now' then full_name || '’s membership for ' || p_year || ' is now due. It is in a grace period until 1 March, and access to the members’ area ends after that.'
          when 'one-month' then full_name || '’s membership for ' || p_year || ' has not been renewed yet. There is one month left: access to the members’ area ends on 1 March ' || p_year || '.'
          when 'last-week' then full_name || '’s membership for ' || p_year || ' has not been renewed yet. This is the last week: access to the members’ area ends on 1 March ' || p_year || '.'
          else full_name || ' membership for the year of ' || p_year || ' has not been renewed yet.' end,
        public.membership_renewal_fee_text(member_id, p_year),
        public.membership_renewal_payment_text(member_id, p_year)),
      action_href, auth_user_id is not null,
      'renewal-reminder-' || member_id || '-' || p_year || '-' || to_char(p_day, 'YYYY-MM-DD')
    from due
    on conflict (deduplication_key) do nothing
    returning 1
  )
  select count(*) into queued from inserted;
  return queued;
end $$;

revoke all on function public.queue_membership_renewal_reminders_core(integer, text, date, integer) from public, anon, authenticated;
grant execute on function public.queue_membership_renewal_reminders_core(integer, text, date, integer) to service_role;

create or replace function public.queue_membership_renewal_reminders(p_year integer, p_actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_membership_management_capability(p_actor)
    or not exists (select 1 from public.membership_renewal_campaigns where membership_year = p_year and open) then
    raise exception 'membership_campaign_unavailable';
  end if;
  return public.queue_membership_renewal_reminders_core(
    p_year, 'manual', (now() at time zone 'Europe/London')::date, 7);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Renewal reminders: the four dates
-- ---------------------------------------------------------------------------------------------

create or replace function public.run_membership_renewal_reminder_schedule(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
  v_year integer;
  v_open boolean;
begin
  v_stage := case
    when extract(month from p_day) = 12 and extract(day from p_day) = 1 then 'due-soon'
    when extract(month from p_day) = 1 and extract(day from p_day) = 1 then 'due-now'
    when extract(month from p_day) = 2 and extract(day from p_day) = 1 then 'one-month'
    when extract(month from p_day) = 2 and extract(day from p_day) = 22 then 'last-week'
    else null end;
  if v_stage is null then return null; end if;
  -- A day replayed long after it happened is not worth sending any more.
  if (now() at time zone 'Europe/London')::date - p_day > 3 then
    return jsonb_build_object('stage', v_stage, 'skipped', 'too-late');
  end if;
  v_year := extract(year from p_day)::integer + case when extract(month from p_day) = 12 then 1 else 0 end;
  select open into v_open from public.membership_renewal_campaigns where membership_year = v_year;
  if not coalesce(v_open, false) then
    return jsonb_build_object('stage', v_stage, 'year', v_year, 'campaign_open', false, 'queued', 0);
  end if;
  return jsonb_build_object('stage', v_stage, 'year', v_year, 'campaign_open', true,
    'queued', public.queue_membership_renewal_reminders_core(v_year, v_stage, p_day, 0));
end $$;

revoke all on function public.run_membership_renewal_reminder_schedule(date) from public, anon, authenticated;
grant execute on function public.run_membership_renewal_reminder_schedule(date) to service_role;

-- ---------------------------------------------------------------------------------------------
-- The daily catch-up now also sends the scheduled reminders and runs retention
-- ---------------------------------------------------------------------------------------------

create or replace function public.run_membership_daily_catch_up(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last date;
  v_from date;
  v_day date;
  v_result jsonb;
  v_reminders jsonb;
  v_days integer := 0;
begin
  select max(run_date) into v_last from public.membership_daily_runs;
  -- With no history, only today is run: nothing is replayed from before the job started.
  v_from := case when v_last is null then p_today
    else least(p_today, greatest(v_last + 1, p_today - 60)) end;
  for v_day in select generate_series(v_from, p_today, interval '1 day')::date loop
    v_result := public.run_membership_daily(v_day);
    v_reminders := public.run_membership_renewal_reminder_schedule(v_day);
    if v_reminders is not null then v_result := v_result || jsonb_build_object('reminders', v_reminders); end if;
    insert into public.membership_daily_runs(run_date, result) values (v_day, v_result)
    on conflict (run_date) do update set completed_at = now(), result = excluded.result;
    v_days := v_days + 1;
  end loop;
  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object('days_run', v_days, 'retention', public.run_membership_retention(p_today));
end;
$$;
