-- Renewal emails: bank transfer is listed first as the preferred way to pay (the Society
-- pays a fee on every card payment), followed by card, cheque and cash. The text is laid out
-- in blocks that the delivery function turns into a styled email; it also reads well as plain text.
-- The reminder gets a new subject and opening line. Who is emailed, when, and the personal link
-- are unchanged. Replaces the helpers from 202609190003.

-- The longer layout can pass the old 2,000 character limit when the treasurer's cheque and
-- cash instructions are long, which would stop the email being queued at all.
do $$
declare existing text;
begin
 select conname into existing from pg_constraint
  where conrelid='public.membership_notifications'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%char_length(body)%';
 if existing is not null then
  execute format('alter table public.membership_notifications drop constraint %I',existing);
 end if;
 alter table public.membership_notifications drop constraint if exists membership_notifications_body_length;
 alter table public.membership_notifications
  add constraint membership_notifications_body_length check (char_length(body) between 2 and 4000);
end $$;

create or replace function public.membership_renewal_quote(
  p_member_id uuid, p_year integer,
  out plan_name text, out previous_name text, out fee_pence integer)
language plpgsql stable security invoker set search_path='' as $$
declare m public.members; t public.membership_plan_transitions; target_id uuid;
begin
 select * into m from public.members where id=p_member_id;
 if not found or m.current_plan_id is null then return; end if;
 select * into t from public.membership_plan_transitions
  where member_id=p_member_id and membership_year=p_year
   and status in ('scheduled','approved','awaiting_student_review');
 -- A pending Student request decides the fee, so no amount can be quoted yet.
 if t.id is not null and t.status='awaiting_student_review' then return; end if;
 target_id:=coalesce(t.to_plan_id,m.current_plan_id);
 select name into plan_name from public.membership_plans where id=target_id;
 select amount_pence into fee_pence from public.membership_plan_prices
  where plan_id=target_id and active and membership_year<=p_year
  order by membership_year desc, version desc limit 1;
 if plan_name is null or fee_pence is null then plan_name:=null; fee_pence:=null; return; end if;
 if t.id is not null and t.from_plan_id is distinct from t.to_plan_id then
  select name into previous_name from public.membership_plans where id=t.from_plan_id;
 end if;
end $$;
revoke all on function public.membership_renewal_quote(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_quote(uuid,integer) to service_role;

create or replace function public.membership_renewal_fee_text(p_member_id uuid, p_year integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare q record;
begin
 select * into q from public.membership_renewal_quote(p_member_id,p_year);
 if q.fee_pence is null then return null; end if;
 return 'Membership: '||q.plan_name||E'\nFee for '||p_year||': £'||to_char(q.fee_pence/100.0,'FM999990.00')
  ||case when q.previous_name is not null
   then E'\nYour membership type changes from '||q.previous_name||' to '||q.plan_name||' for '||p_year||'.' else '' end;
end $$;
revoke all on function public.membership_renewal_fee_text(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_fee_text(uuid,integer) to service_role;

-- Every way to pay, best first. Blocks are separated by a blank line and each payment
-- block starts "Pay by ...", which is what the delivery function looks for.
create or replace function public.membership_renewal_payment_text(p_member_id uuid, p_year integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare s public.membership_payment_settings_versions; member_name text; q record;
 card text := E'Pay by card\nUse your personal link to pay on a secure card payment page. It is one payment for the year and nothing is set up to charge you again. The link works until 31 December '||p_year||'.';
begin
 select full_name into member_name from public.members where id=p_member_id;
 select * into s from public.membership_payment_settings_versions where active and configured;
 -- Placeholder details are never emailed: fall back to asking the officer.
 if s.id is null or member_name is null then
  return card||E'\n\nIf you would rather pay by bank transfer, cheque or cash, or have any questions, please contact the membership officer.';
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
  ||E'\n\nIf you pay by bank transfer, cheque or cash, your membership is renewed once the officer has recorded the payment. If you have any questions, please contact the membership officer.';
end $$;
revoke all on function public.membership_renewal_payment_text(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_payment_text(uuid,integer) to service_role;
drop function if exists public.membership_renewal_other_ways_text(uuid);

create or replace function public.queue_membership_renewal_invitation(p_member_id uuid,p_year integer,p_actor uuid,p_token text,p_token_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.members; invitation uuid; target_plan uuid; age integer;
begin
 if not public.has_membership_management_capability(p_actor) or not exists(select 1 from public.membership_renewal_campaigns where membership_year=p_year and open) then raise exception 'membership_campaign_unavailable'; end if;
 select * into m from public.members where id=p_member_id for update;
 if not found or m.effective_state not in ('active','grace','lapsed') or exists(select 1 from public.membership_terms where member_id=m.id and membership_year=p_year and (status='paid' or amount_paid_pence>0)) then return false; end if;
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
 values(m.id,p_year,p_token_hash,make_timestamptz(p_year+1,1,1,0,0,0,'Europe/London'))
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
    public.membership_renewal_payment_text(member_id,p_year),
    'If you have already paid, please contact the membership officer so they can check your record.'),
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
