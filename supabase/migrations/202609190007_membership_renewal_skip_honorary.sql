-- Members who have (or are about to have) lifetime honorary membership owe no renewal fee, so opening
-- renewals must not invite them, remind them, or ask an officer to "contact them to arrange their renewal".
-- Before this, someone whose honorary start date was still in the future was treated as an ordinary member.
-- Mirrors the "Honorary membership covers this year" rule in lib/membership-rules.ts: honorary cover for
-- the year means no fee, unless honorary membership ends part-way through that year with a replacement
-- type, in which case a reduced fee is due.

create or replace function public.membership_honorary_covers_year(p_member_id uuid, p_year integer)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.honorary_memberships h
  where h.member_id=p_member_id and h.status in ('scheduled','active')
   and h.effective_from<=make_date(p_year,12,31)
   and (h.revoked_effective_on is null or h.revoked_effective_on>make_date(p_year,1,1))
   and not (h.revoked_effective_on is not null
    and extract(year from h.revoked_effective_on)::integer=p_year and h.replacement_plan_id is not null));
$$;
revoke all on function public.membership_honorary_covers_year(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_honorary_covers_year(uuid,integer) to service_role;

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
   and not public.membership_honorary_covers_year(m.id,p_year)
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


-- Close renewal contact tasks already raised for such members.
update public.membership_notifications n set read_at=now(),updated_at=now()
where n.kind='membership.manual-contact-officer' and n.read_at is null
 and n.deduplication_key like 'renewal-invitation-%'
 and n.member_id is not null
 and public.membership_honorary_covers_year(n.member_id,right(n.deduplication_key,4)::integer);
