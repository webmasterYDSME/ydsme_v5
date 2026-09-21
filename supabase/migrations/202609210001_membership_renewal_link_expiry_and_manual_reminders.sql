-- Renewal link expiry is stated once, and renewal reminders are only ever sent by an officer.
--
-- 1. The renewal link used to expire at the start of 1 January of the year after the renewal year (so a 2027
--    link works through 31 December 2027), while the email said "31 December <year>" as fixed wording. The
--    date now comes from one place: membership_renewal_link_expires_at(year) sets it when the invitation is
--    created, and the email reads the invitation's own stored expiry (falling back to that same rule for a
--    member who has no invitation yet, such as the officer's test email). The date the members are told is the
--    date the link stops working. Nothing about how long the link lasts changes.
--
-- 2. The scheduled reminders (1 December, 1 January, 1 February, 22 February) are removed. The daily catch-up
--    no longer sends them and the stage-based routine is dropped. The officer's Send reminder button stays,
--    with its rules: invited members whose invitation email has been sent, with an email address, active or in
--    grace or lapsed, no paid or part-paid term for the year, not honorary, one reminder every 7 days.
--    Needs 0005 to 0007 and 0017 applied first, and 202609200004 (the invitation must have been sent).

-- ---------------------------------------------------------------------------------------------
-- One rule for how long a renewal link lasts
-- ---------------------------------------------------------------------------------------------

create or replace function public.membership_renewal_link_expires_at(p_year integer)
returns timestamptz language sql stable security invoker set search_path='' as $$
 select make_timestamptz(p_year+1,1,1,0,0,0,'Europe/London');
$$;

-- The last day the link works, for the email: the day before the expiry moment, as "31 December 2027".
create or replace function public.membership_renewal_link_last_day_text(p_member_id uuid, p_year integer)
returns text language sql stable security invoker set search_path='' as $$
 select extract(day from x.d)::integer||' '
  ||(array['January','February','March','April','May','June','July','August','September','October','November','December'])[extract(month from x.d)::integer]
  ||' '||extract(year from x.d)::integer
 from (select (((coalesce(
   (select i.expires_at from public.membership_renewal_invitations i where i.member_id=p_member_id and i.membership_year=p_year),
   public.membership_renewal_link_expires_at(p_year))) at time zone 'Europe/London') - interval '1 second')::date as d) x;
$$;

revoke all on function public.membership_renewal_link_expires_at(integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_link_expires_at(integer) to service_role;
revoke all on function public.membership_renewal_link_last_day_text(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_link_last_day_text(uuid,integer) to service_role;

-- The payment block is unchanged except that the card paragraph names the real last day.
create or replace function public.membership_renewal_payment_text(p_member_id uuid, p_year integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare s public.membership_payment_settings_versions; member_name text; q record;
 card text := E'Pay by card\nUse your personal link to pay on a secure card payment page. It is one payment for the year and nothing is set up to charge you again. The link works until '||public.membership_renewal_link_last_day_text(p_member_id,p_year)||'.';
begin
 select full_name into member_name from public.members where id=p_member_id;
 select * into s from public.membership_payment_settings_versions where active and configured;
 -- Placeholder details are never emailed: fall back to asking the officer.
 if s.id is null or member_name is null then
  return card||E'\n\nIf you would rather pay by bank transfer, cheque or cash, please contact the membership officer.'
   ||E'\n\nThis is an automated email. If you have already paid, there is nothing you need to do. The membership officer may not have recorded your payment yet.';
 end if;
 select * into q from public.membership_renewal_quote(p_member_id,p_year);
 return E'Pay by bank transfer (preferred)\nThis is the Society''s preferred way to pay. There is no card fee, so your whole payment goes to the Society.'
  ||E'\nAccount name: '||s.bank_account_name
  ||E'\nSort code: '||s.bank_sort_code
  ||E'\nAccount number: '||s.bank_account_number
  ||case when q.fee_pence is not null then E'\nAmount: £'||to_char(q.fee_pence/100.0,'FM999990.00') else '' end
  ||E'\nReference: '||member_name
  ||E'\n\n'||card
  ||E'\n\nPay by cheque\nPayable to: '||s.cheque_payee
  ||E'\n'||s.cheque_delivery_instructions
  ||E'\n\nPay by cash\n'||s.cash_instructions
  ||E'\n\nThis is an automated email. If you have already paid, there is nothing you need to do. The membership officer may not have recorded your payment yet.';
end $$;
revoke all on function public.membership_renewal_payment_text(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_payment_text(uuid,integer) to service_role;

-- The invitation is the same as before, but takes its expiry from the shared rule.
create or replace function public.queue_membership_renewal_invitation(p_member_id uuid,p_year integer,p_actor uuid,p_token text,p_token_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.members; invitation uuid; target_plan uuid; age integer;
begin
 if not public.has_membership_management_capability(p_actor) or not exists(select 1 from public.membership_renewal_campaigns where membership_year=p_year and open) then raise exception 'membership_campaign_unavailable'; end if;
 select * into m from public.members where id=p_member_id for update;
 if not found or m.effective_state not in ('active','grace','lapsed') or exists(select 1 from public.membership_terms where member_id=m.id and membership_year=p_year and (status='paid' or amount_paid_pence>0))
  or public.membership_honorary_covers_year(m.id,p_year) then return false; end if;
 -- Resolve age changes when the officer opens renewals, even before November.
 age:=public.membership_age_on(m.date_of_birth,make_date(p_year,1,1));
 select target.id into target_plan from public.membership_plans current_plan join public.membership_plans target on target.slug=case
  when age>=80 and current_plan.slug<>'concession' then 'concession'
  when current_plan.slug='junior' and age>=18 then 'adult'
  when current_plan.slug='student' and age>=25 then 'adult' else null end and target.active
 where current_plan.id=m.current_plan_id;
 if target_plan is not null then
  insert into public.membership_plan_transitions(member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on)
  values(m.id,p_year,m.current_plan_id,target_plan,'age','scheduled',make_date(p_year,1,1))
  on conflict(member_id,membership_year) do nothing;
 end if;
 insert into public.membership_renewal_invitations(member_id,membership_year,token_hash,expires_at)
 values(m.id,p_year,p_token_hash,public.membership_renewal_link_expires_at(p_year))
 on conflict(member_id,membership_year) do nothing returning id into invitation;
 if invitation is null then return false; end if;
 insert into public.membership_notifications(member_id,recipient_email,recipient_user_id,kind,title,body,action_href,portal_visible,deduplication_key)
 values(m.id,m.contact_email,m.auth_user_id,
 case when m.contact_email is null then 'membership.manual-contact-officer' else 'membership.renewal-invitation' end,
 'Renew '||m.full_name||'''s '||p_year||' membership',
 case when m.contact_email is null then 'Contact '||m.full_name||' to arrange their renewal.' else concat_ws(E'\n\n',
  m.full_name||'''s membership of the Society is due for renewal for '||p_year||'.',
  public.membership_renewal_fee_text(m.id,p_year),
  public.membership_renewal_payment_text(m.id,p_year)) end,
 case when m.contact_email is null then null else '/membership/renew?token='||p_token end,m.auth_user_id is not null,
 'renewal-invitation-'||m.id||'-'||p_year);
 return true;
end $$;
revoke all on function public.queue_membership_renewal_invitation(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_membership_renewal_invitation(uuid,integer,uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Reminders are sent only by an officer
-- ---------------------------------------------------------------------------------------------

-- The daily job no longer sends reminders (it still runs the state changes and retention).
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
  v_days integer := 0;
begin
  select max(run_date) into v_last from public.membership_daily_runs;
  -- With no history, only today is run: nothing is replayed from before the job started.
  v_from := case when v_last is null then p_today
    else least(p_today, greatest(v_last + 1, p_today - 60)) end;
  for v_day in select generate_series(v_from, p_today, interval '1 day')::date loop
    v_result := public.run_membership_daily(v_day);
    insert into public.membership_daily_runs(run_date, result) values (v_day, v_result)
    on conflict (run_date) do update set completed_at = now(), result = excluded.result;
    v_days := v_days + 1;
  end loop;
  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object('days_run', v_days, 'retention', public.run_membership_retention(p_today));
end;
$$;

drop function if exists public.run_membership_renewal_reminder_schedule(date);
drop function if exists public.queue_membership_renewal_reminders_core(integer, text, date, integer);

create or replace function public.queue_membership_renewal_reminders(p_year integer, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued integer;
begin
  if not public.has_membership_management_capability(p_actor)
    or not exists (select 1 from public.membership_renewal_campaigns where membership_year = p_year and open) then
    raise exception 'membership_campaign_unavailable';
  end if;
  with due as (
    select m.id as member_id, m.full_name, m.contact_email, m.auth_user_id, invitation_notice.action_href
    from public.membership_renewal_invitations i
    join public.members m on m.id = i.member_id
    join public.membership_notifications invitation_notice
      on invitation_notice.deduplication_key = 'renewal-invitation-' || m.id || '-' || p_year
    where i.membership_year = p_year
      and i.expires_at > now()
      and m.effective_state in ('active', 'grace', 'lapsed')
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
          and earlier.created_at > now() - interval '7 days')
  ), inserted as (
    insert into public.membership_notifications(
      member_id, recipient_email, recipient_user_id, kind, title, body, action_href, portal_visible, deduplication_key)
    select member_id, contact_email, auth_user_id, 'membership.renewal-reminder',
      'Please renew your YDSME ' || p_year || ' membership',
      concat_ws(E'\n\n',
        full_name || ' membership for the year of ' || p_year || ' has not been renewed yet.',
        public.membership_renewal_fee_text(member_id, p_year),
        public.membership_renewal_payment_text(member_id, p_year)),
      action_href, auth_user_id is not null,
      'renewal-reminder-' || member_id || '-' || p_year || '-' || to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM-DD')
    from due
    on conflict (deduplication_key) do nothing
    returning 1
  )
  select count(*) into queued from inserted;
  return queued;
end $$;

revoke all on function public.queue_membership_renewal_reminders(integer, uuid) from public, anon, authenticated;
grant execute on function public.queue_membership_renewal_reminders(integer, uuid) to service_role;
