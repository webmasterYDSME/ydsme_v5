-- Two problems found while auditing email delivery.
--
-- 1. Every immediate email started its own request to the delivery function. Sending 213 mails at once
--    started more than 400 requests in a few seconds and about 50 of them failed with "connection reset".
--    Now one request is made, and mail added in the next few seconds is picked up by that request's
--    follow-up round or by the delivery job that runs every minute.
--
-- 2. A renewal reminder could be queued for a member whose invitation was still waiting in the email
--    queue, so the member could get the reminder before (or as well as) the invitation. Reminders now go
--    only to members whose invitation has actually been sent.

alter table public.email_queue_settings add column if not exists last_dispatch_at timestamptz;

create or replace function public.dispatch_due_membership_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_last timestamptz;
begin
  if new.recipient_email is not null
    and new.email_status = 'queued'
    and new.delivery_class = 'immediate'
    and new.scheduled_for <= now() then
    begin
      -- skip locked: if another sender is already deciding, it will make the request.
      select last_dispatch_at into v_last from public.email_queue_settings where id for update skip locked;
      if found and (v_last is null or v_last < now() - interval '3 seconds') then
        update public.email_queue_settings set last_dispatch_at = now() where id;
        perform public.request_membership_notification_delivery();
      end if;
    exception when others then
      -- The durable outbox row must survive a delivery configuration or network
      -- failure. The recovery job reports the configuration error and retries.
      raise warning 'Immediate membership email dispatch could not be requested.';
    end;
  end if;
  return new;
end;
$$;

create or replace function public.queue_membership_renewal_reminders_core(p_year integer, p_stage text, p_day date, p_min_gap_days integer)
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
      -- The invitation must have gone out. Invitations wait in the email queue, and a reminder sent
      -- before the invitation would only confuse the member.
      and invitation_notice.email_status = 'sent'
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
