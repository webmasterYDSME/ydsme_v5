-- Renewal emails: one short closing note instead of two ("If you pay by bank transfer... renewed once
-- the officer has recorded the payment" and, on reminders, "If you have already paid..."):
-- "This is an automated email. If you have already paid, there is nothing you need to do. The membership
-- officer may not have recorded your payment yet." Only the message text changes.

create or replace function public.membership_renewal_payment_text(p_member_id uuid, p_year integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare s public.membership_payment_settings_versions; member_name text; q record;
 card text := E'Pay by card\nUse your personal link to pay on a secure card payment page. It is one payment for the year and nothing is set up to charge you again. The link works until 31 December '||p_year||'.';
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

create or replace function public.queue_membership_renewal_reminders(p_year integer, p_actor uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare queued integer;
begin
 if not public.has_membership_management_capability(p_actor)
  or not exists(select 1 from public.membership_renewal_campaigns where membership_year=p_year and open) then
  raise exception 'membership_campaign_unavailable';
 end if;
 with due as (
  select m.id as member_id, m.full_name, m.contact_email, m.auth_user_id, invitation_notice.action_href
  from public.membership_renewal_invitations i
  join public.members m on m.id=i.member_id
  join public.membership_notifications invitation_notice
   on invitation_notice.deduplication_key='renewal-invitation-'||m.id||'-'||p_year
  where i.membership_year=p_year
   and i.expires_at>now()
   and m.effective_state in ('active','grace','lapsed')
   and m.contact_email is not null
   and invitation_notice.kind='membership.renewal-invitation'
   and invitation_notice.action_href is not null
   and not exists(
    select 1 from public.membership_terms t
    where t.member_id=m.id and t.membership_year=p_year and (t.status='paid' or t.amount_paid_pence>0))
   and not exists(
    select 1 from public.membership_notifications earlier
    where earlier.kind='membership.renewal-reminder'
     and starts_with(earlier.deduplication_key,'renewal-reminder-'||m.id||'-'||p_year||'-')
     and earlier.created_at>now()-interval '7 days')
 ), inserted as (
  insert into public.membership_notifications(member_id,recipient_email,recipient_user_id,kind,title,body,action_href,portal_visible,deduplication_key)
  select member_id,contact_email,auth_user_id,'membership.renewal-reminder',
   'Please renew your YDSME '||p_year||' membership',
   concat_ws(E'\n\n',
    full_name||' membership for the year of '||p_year||' has not been renewed yet.',
    public.membership_renewal_fee_text(member_id,p_year),
    public.membership_renewal_payment_text(member_id,p_year)),
   action_href,auth_user_id is not null,
   'renewal-reminder-'||member_id||'-'||p_year||'-'||to_char(now() at time zone 'Europe/London','YYYY-MM-DD')
  from due
  on conflict(deduplication_key) do nothing
  returning 1
 )
 select count(*) into queued from inserted;
 return queued;
end $$;
revoke all on function public.queue_membership_renewal_reminders(integer,uuid) from public,anon,authenticated;
grant execute on function public.queue_membership_renewal_reminders(integer,uuid) to service_role;
