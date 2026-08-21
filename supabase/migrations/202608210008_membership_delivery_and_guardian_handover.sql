-- Durable provider delivery state, retry recovery, member-named renewal
-- messages, guardian copies, and the Junior-to-adult contact handover.

alter table public.membership_notifications
  add column if not exists provider_message_id text,
  add column if not exists provider_delivery_status text
    check (provider_delivery_status is null or provider_delivery_status in ('accepted','delivered','bounced','complained','suppressed'));
create index if not exists membership_notifications_provider_message_idx
  on public.membership_notifications(provider_message_id) where provider_message_id is not null;

alter table public.members
  add column if not exists guardian_authority_ended_at timestamptz;

drop function if exists public.claim_membership_notifications(integer);
create function public.claim_membership_notifications(p_limit integer default 25)
returns table(
  notification_id uuid, member_id uuid, recipient_email text, title text, body text,
  kind text, action_href text, email_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.membership_notifications notification
  set email_status='failed',last_email_error='A stale delivery claim was recovered.',
      scheduled_for=now(),updated_at=now()
  where notification.email_status='sending' and notification.updated_at<now()-interval '10 minutes';

  return query
  with candidates as (
    select notification.id
    from public.membership_notifications notification
    left join public.membership_email_suppressions suppression
      on suppression.normalized_email=lower(notification.recipient_email)
    where notification.email_status in ('queued','failed')
      and notification.recipient_email is not null
      and notification.scheduled_for<=now()
      and notification.email_attempts<5
      and coalesce(suppression.transactional_suppressed,false)=false
    order by notification.scheduled_for,notification.created_at
    for update of notification skip locked
    limit greatest(1,least(p_limit,100))
  ), claimed as (
    update public.membership_notifications notification
    set email_status='sending',email_attempts=notification.email_attempts+1,
        last_email_error=null,updated_at=now()
    from candidates where notification.id=candidates.id
    returning notification.*
  )
  select claimed.id,claimed.member_id,claimed.recipient_email,claimed.title,claimed.body,
    claimed.kind,claimed.action_href,claimed.email_attempts
  from claimed;
end;
$$;

drop function if exists public.complete_membership_notification(uuid,boolean,text);
create function public.complete_membership_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare v_notification public.membership_notifications%rowtype;
begin
  update public.membership_notifications notification set
    email_status=case when p_sent then 'sent' else 'failed' end,
    email_sent_at=case when p_sent then now() else null end,
    provider_message_id=case when p_sent then coalesce(p_provider_message_id,notification.provider_message_id) else notification.provider_message_id end,
    provider_delivery_status=case when p_sent then 'accepted' else notification.provider_delivery_status end,
    last_email_error=case when p_sent then null else left(coalesce(p_error,'Email delivery failed.'),500) end,
    scheduled_for=case when p_sent then notification.scheduled_for
      else now()+make_interval(secs=>least(21600,greatest(60,power(2,least(notification.email_attempts,8))::integer*60))) end,
    updated_at=now()
  where notification.id=p_notification_id and notification.email_status='sending'
  returning * into v_notification;
  if not found then return false; end if;

  if not p_sent and v_notification.email_attempts>=5 then
    insert into public.membership_notifications(
      member_id,application_id,recipient_user_id,kind,title,body,action_href,
      portal_visible,email_status,deduplication_key
    ) select v_notification.member_id,v_notification.application_id,officer.user_id,
      'membership.email-delivery-officer','Membership email needs attention',
      format('An email concerning %s could not be delivered after five attempts. Correct the address or retry it from the membership area.',
        coalesce(member.full_name,application.full_name,'a member')),
      '/admin/memberships?section=delivery-problems#delivery-problems',true,'cancelled',
      'membership-email-exhausted-'||v_notification.id::text||'-'||officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role='administrator'
      union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
    ) officer
    left join public.members member on member.id=v_notification.member_id
    left join public.membership_applications application on application.id=v_notification.application_id
    on conflict(deduplication_key) do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.record_membership_delivery_event(
  p_provider_message_id text,
  p_provider_event_id text,
  p_event_type text,
  p_safe_detail text,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_notification public.membership_notifications%rowtype; v_event_id uuid;
begin
  if p_event_type not in ('accepted','delivered','bounced','complained','suppressed')
    or nullif(btrim(p_provider_message_id),'') is null
    or nullif(btrim(p_provider_event_id),'') is null then
    raise exception 'membership_delivery_event_invalid';
  end if;
  select * into v_notification from public.membership_notifications
    where provider_message_id=p_provider_message_id order by created_at desc limit 1 for update;
  if not found then return null; end if;
  insert into public.membership_delivery_events(
    notification_id,provider_message_id,provider_event_id,event_type,safe_detail,occurred_at
  ) values (
    v_notification.id,p_provider_message_id,p_provider_event_id,p_event_type,left(p_safe_detail,500),p_occurred_at
  ) on conflict(provider_event_id) do update set provider_event_id=excluded.provider_event_id
  returning id into v_event_id;
  update public.membership_notifications set provider_delivery_status=p_event_type,updated_at=now()
    where id=v_notification.id;
  if p_event_type in ('bounced','complained','suppressed') and v_notification.recipient_email is not null then
    insert into public.membership_email_suppressions(
      normalized_email,newsletter_suppressed,transactional_suppressed,reason
    ) values (
      lower(v_notification.recipient_email),true,p_event_type in ('bounced','complained'),
      'Email provider reported '||p_event_type||'.'
    ) on conflict(normalized_email) do update set
      newsletter_suppressed=true,
      transactional_suppressed=public.membership_email_suppressions.transactional_suppressed or excluded.transactional_suppressed,
      reason=excluded.reason,updated_at=now();
  end if;
  return v_event_id;
end;
$$;

revoke all on function public.claim_membership_notifications(integer),
  public.complete_membership_notification(uuid,boolean,text,text),
  public.record_membership_delivery_event(text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.claim_membership_notifications(integer),
  public.complete_membership_notification(uuid,boolean,text,text),
  public.record_membership_delivery_event(text,text,text,text,timestamptz)
  to service_role;

create or replace function public.prepare_member_named_renewal_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_notice_date date;
  v_target_year integer;
  v_price integer;
begin
  if new.kind not in ('membership.renewal-upcoming','membership.renewal-overdue') or new.member_id is null then
    return new;
  end if;
  select * into v_member from public.members where id=new.member_id;
  begin
    v_notice_date:=right(new.deduplication_key,10)::date;
  exception when others then
    v_notice_date:=(now() at time zone 'Europe/London')::date;
  end;
  v_target_year:=extract(year from v_notice_date)::integer+case when extract(month from v_notice_date)=12 then 1 else 0 end;
  select price.amount_pence into v_price from public.membership_plan_prices price
    where price.plan_id=v_member.current_plan_id and price.membership_year=v_target_year and price.active
    order by price.version desc limit 1;
  new.title:=v_member.full_name||case when new.kind='membership.renewal-upcoming'
    then '''s membership renewal is approaching' else '''s membership renewal is overdue' end;
  new.body:=case when new.kind='membership.renewal-upcoming'
    then format('%s, the %s membership renewal is £%s and is due on 1 January %s. Review the payment and automatic-renewal setting in the member account.',
      v_member.full_name,v_target_year,trim(to_char(v_price/100.0,'FM999999990.00')),v_target_year)
    else format('%s, the £%s membership renewal for %s is unpaid. Access continues during the grace period through the end of February.',
      v_member.full_name,trim(to_char(v_price/100.0,'FM999999990.00')),v_target_year) end;
  if v_member.auth_user_id is null then new.action_href:=null; end if;
  return new;
end;
$$;

drop trigger if exists prepare_member_named_renewal_notice on public.membership_notifications;
create trigger prepare_member_named_renewal_notice
before insert on public.membership_notifications for each row
execute function public.prepare_member_named_renewal_notice();

create or replace function public.copy_junior_financial_notice_to_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.members%rowtype;
begin
  if new.member_id is null or new.recipient_email is null
    or new.kind not like 'membership.%'
    or new.kind not in ('membership.renewal-upcoming','membership.renewal-overdue','membership.renewal-paid',
      'membership.renewal-failed','membership.payment-action-required','membership.price-changed') then
    return new;
  end if;
  select * into v_member from public.members where id=new.member_id;
  if v_member.guardian_email is not null and v_member.guardian_authority_ended_at is null
    and v_member.date_of_birth is not null
    and public.membership_age_on(v_member.date_of_birth,(now() at time zone 'Europe/London')::date)<18
    and lower(v_member.guardian_email)<>lower(new.recipient_email) then
    insert into public.membership_notifications(
      member_id,recipient_email,kind,title,body,action_href,portal_visible,scheduled_for,deduplication_key
    ) values (
      new.member_id,v_member.guardian_email,new.kind,new.title||' — guardian copy',
      'Guardian copy concerning '||v_member.full_name||'. '||new.body,null,false,new.scheduled_for,
      left(new.deduplication_key||'-guardian',180)
    ) on conflict(deduplication_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists copy_junior_financial_notice_to_guardian on public.membership_notifications;
create trigger copy_junior_financial_notice_to_guardian
after insert on public.membership_notifications for each row
execute function public.copy_junior_financial_notice_to_guardian();

create or replace function public.prepare_junior_adult_handover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.members%rowtype; v_from_slug text;
begin
  select slug into v_from_slug from public.membership_plans where id=new.from_plan_id;
  if v_from_slug<>'junior' then return new; end if;
  select * into v_member from public.members where id=new.member_id;
  if new.status in ('scheduled','approved') and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.membership_notifications(
      member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
    ) values (
      v_member.id,v_member.auth_user_id,v_member.contact_email,'membership.junior-adult-contact',
      v_member.full_name||'''s contact details need confirmation',
      format('%s turns 18 for the %s membership year. Confirm a personal correspondence and login email before guardian authority ends, or tell the membership officer that the shared correspondence address should continue.',
        v_member.full_name,new.membership_year),
      case when v_member.auth_user_id is null then null else '/account' end,
      'junior-adult-contact-'||new.id::text
    ) on conflict(deduplication_key) do nothing;
  end if;
  if new.status='applied' and (tg_op='INSERT' or old.status is distinct from 'applied') then
    update public.members set guardian_authority_ended_at=coalesce(guardian_authority_ended_at,now()),
      contact_role=case when contact_role='guardian' then 'shared_household' else contact_role end,updated_at=now()
      where id=new.member_id;
    if v_member.auth_user_id is null then
      insert into public.membership_notifications(
        member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
      ) select v_member.id,officer.user_id,'membership.junior-adult-officer',
        'Adult contact details need review',
        v_member.full_name||' has moved from Junior membership without an individual portal login. Confirm their adult contact preference; never attach the guardian''s login.',
        '/admin/memberships?section=applications#applications','cancelled',
        'junior-adult-officer-'||new.id::text||'-'||officer.user_id::text
      from (
        select role.user_id from public.user_roles role where role.role='administrator'
        union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
      ) officer on conflict(deduplication_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_junior_adult_handover on public.membership_plan_transitions;
create trigger prepare_junior_adult_handover
after insert or update of status on public.membership_plan_transitions for each row
execute function public.prepare_junior_adult_handover();

revoke all on function public.prepare_member_named_renewal_notice(),
  public.copy_junior_financial_notice_to_guardian(),public.prepare_junior_adult_handover()
  from public,anon,authenticated;
