-- Operational safeguards: junior guardian copies, exhausted-delivery officer
-- alerts, expiring public applications and canonical access precedence.

create or replace function public.copy_junior_membership_notification_to_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_guardian_email text;
begin
  if new.member_id is null or new.recipient_email is null
    or new.kind not in (
      'membership.activated','membership.renewal-upcoming','membership.renewal-overdue',
      'membership.renewal-paid','membership.payment-disputed','membership.payment-refunded',
      'membership.auto-renew-changed'
    ) then return new; end if;
  select member.guardian_email into v_guardian_email
  from public.members member
  join public.membership_plans plan on plan.id=member.current_plan_id
  where member.id=new.member_id and plan.slug='junior';
  if v_guardian_email is null or lower(v_guardian_email)=lower(new.recipient_email) then return new; end if;
  insert into public.membership_notifications(
    member_id, recipient_email, kind, title, body, action_href, portal_visible,
    scheduled_for, deduplication_key
  ) values (
    new.member_id, lower(v_guardian_email), new.kind, new.title,
    'Guardian copy: ' || new.body, new.action_href, false,
    new.scheduled_for, left(new.deduplication_key || '-guardian',180)
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;

drop trigger if exists junior_membership_guardian_notification on public.membership_notifications;
create trigger junior_membership_guardian_notification
after insert on public.membership_notifications
for each row execute function public.copy_junior_membership_notification_to_guardian();

create or replace function public.complete_membership_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare v_notification public.membership_notifications%rowtype;
begin
  update public.membership_notifications
  set email_status = case when p_sent then 'sent' else 'failed' end,
      email_sent_at = case when p_sent then now() else null end,
      last_email_error = case when p_sent then null else left(coalesce(p_error, 'Email delivery failed.'), 500) end,
      updated_at = now()
  where id = p_notification_id and email_status = 'sending'
  returning * into v_notification;
  if not found then return false; end if;
  if not p_sent and v_notification.email_attempts >= 5 then
    insert into public.membership_notifications(
      member_id, application_id, recipient_user_id, kind, title, body, action_href,
      email_status, deduplication_key
    )
    select v_notification.member_id, v_notification.application_id, officer.user_id,
      'membership.delivery-failure-officer', 'Membership email delivery failed',
      'A membership email exhausted all automatic retries. Review the delivery queue and contact details.',
      '/admin/memberships?queue=delivery-failures', 'membership-delivery-exhausted-' || v_notification.id::text || '-' || officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role='administrator'
      union
      select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
    ) officer
    on conflict(deduplication_key) do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.expire_membership_applications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.membership_applications
  set status='expired', updated_at=now()
  where status not in ('converted','rejected','expired')
    and (expires_at <= now() or (status='email_verification_pending' and verification_expires_at <= now()));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.sync_canonical_member_access_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.membership_status in ('suspended','archived') then
    update public.members set effective_state=new.membership_status, updated_at=now()
    where auth_user_id=new.id and effective_state<>new.membership_status;
  elsif new.membership_status='active' and old.membership_status in ('suspended','archived','lapsed') then
    update public.members member set effective_state=case
      when exists(select 1 from public.honorary_memberships honorary
        where honorary.member_id=member.id and honorary.status='active') then 'honorary'
      when exists(select 1 from public.membership_terms term
        where term.member_id=member.id and term.membership_year=extract(year from current_date)::integer
          and term.status='paid') then 'active'
      when extract(month from current_date)<3 then 'grace'
      else 'lapsed' end,
      updated_at=now()
    where member.auth_user_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_canonical_membership_access on public.users;
create trigger sync_canonical_membership_access
after update of membership_status on public.users
for each row when (old.membership_status is distinct from new.membership_status)
execute function public.sync_canonical_member_access_state();

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='expire-membership-applications';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'expire-membership-applications', '17 2 * * *',
    'select public.expire_membership_applications()'
  );
end $$;
