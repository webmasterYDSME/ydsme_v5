-- Clearer wording for the renewal invitation and reminder emails.
-- Only the message text changes; who is emailed and when is unchanged.
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
 case when m.contact_email is null then 'Contact '||m.full_name||' to arrange their renewal.' else m.full_name||'''s membership of the Society is due for renewal for '||p_year||E'.\n\nYour personal link shows the fee and takes you to a secure card payment. It is one payment for the year: nothing is set up to charge you again.\n\nThe link works until 31 December '||p_year||E'. If you would rather pay by cash, bank transfer or cheque, or have any questions, please contact the membership officer.' end,
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
   'Reminder: please renew '||full_name||'''s '||p_year||' membership',
   full_name||'''s '||p_year||E' membership of the Society has not been renewed yet.\n\nYour personal link shows the fee and takes you to a secure card payment. It is one payment for the year, and the link works until 31 December '||p_year||E'.\n\nIf you have already paid another way, please contact the membership officer so they can check your record.',
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
