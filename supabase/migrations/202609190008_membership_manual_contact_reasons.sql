-- "To contact" tasks now say what the member needs to be told about. Until now every task
-- from the automatic trigger read "Manual member contact required", so the officer had to
-- open the record to work out why. The task now starts with the reason and includes the
-- notice that could not be sent, so the officer knows what to say.

create or replace function public.membership_manual_contact_reason(p_kind text, p_title text)
returns text language sql immutable set search_path='' as $$
 select case p_kind
  when 'membership.activated' then 'Membership activated'
  when 'membership.renewal-upcoming' then 'Renewal date is coming up'
  when 'membership.renewal-overdue' then 'Renewal is overdue'
  when 'membership.renewal-paid' then 'Renewal payment recorded'
  when 'membership.renewal-failed' then 'Renewal payment failed'
  when 'membership.payment-action-required' then 'Payment needs action'
  when 'membership.payment-disputed' then 'Card payment disputed'
  when 'membership.payment-refunded' then 'Payment refunded'
  when 'membership.payment-reversal' then 'Payment reversed'
  when 'membership.payment-restored' then 'Payment restored'
  when 'membership.auto-renew-changed' then 'Automatic renewal changed'
  when 'membership.grace' then 'Membership is in its grace period'
  when 'membership.lapsed' then 'Membership has lapsed'
  when 'membership.reinstated' then 'Membership is active again'
  when 'membership.price-changed' then 'Membership price changed'
  when 'membership.plan-transition' then 'Membership type is changing'
  when 'membership.junior-adult-contact' then 'Turning 18: contact details need confirming'
  when 'membership.student-request-approved' then 'Student request approved'
  when 'membership.student-request-rejected' then 'Student request declined'
  when 'membership.student-request-reviewed' then 'Student request reviewed'
  when 'membership.honorary-granted' then 'Honorary membership granted'
  when 'membership.honorary-scheduled' then 'Honorary membership scheduled'
  when 'membership.honorary-activated' then 'Honorary membership started'
  when 'membership.honorary-transition' then 'Honorary membership is changing'
  when 'membership.honorary-revocation-scheduled' then 'Honorary membership is ending'
  when 'membership.application-payment-reminder' then 'Reminder to pay for their application'
  else coalesce(nullif(p_title,''),'Membership update') end
$$;
revoke all on function public.membership_manual_contact_reason(text,text) from public,anon,authenticated;
grant execute on function public.membership_manual_contact_reason(text,text) to service_role;

create or replace function public.membership_manual_contact_body(p_kind text, p_title text, p_body text)
returns text language sql immutable set search_path='' as $$
 select public.membership_manual_contact_reason(p_kind,p_title)
  ||E'\n\nThis member has no email or portal account, so this could not be sent to them. Contact them by their recorded offline method and record completion in the membership history.'
  ||E'\n\nThe message they would have received:\n'||left(p_body,1200)
$$;
revoke all on function public.membership_manual_contact_body(text,text,text) from public,anon,authenticated;
grant execute on function public.membership_manual_contact_body(text,text,text) to service_role;

create or replace function public.create_membership_manual_contact_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is not null and new.recipient_email is null and new.recipient_user_id is null
    and new.kind not like '%-officer' then
    insert into public.membership_notifications(
      member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
    )
    select new.member_id,officer.user_id,'membership.manual-contact-officer',
      public.membership_manual_contact_reason(new.kind,new.title),
      public.membership_manual_contact_body(new.kind,new.title,new.body),
      '/admin/memberships?member='||new.member_id::text,'cancelled',
      'membership-manual-contact-'||new.id::text||'-'||officer.user_id::text
    from (
      select u.id as user_id from public.users u join public.user_roles r on r.user_id=u.id
        where u.membership_status='active' and r.role='administrator'
      union
      select u.id from public.users u join public.user_roles r on r.user_id=u.id
        join public.user_capabilities c on c.user_id=u.id and c.capability='memberships.manage'
        where u.membership_status='active' and r.role='committee'
    ) officer
    on conflict(deduplication_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.create_membership_manual_contact_task() from public,anon,authenticated;

-- Open tasks made by the old wording get the reason from the notice they came from.
update public.membership_notifications t
   set title=public.membership_manual_contact_reason(o.kind,o.title),
       body=public.membership_manual_contact_body(o.kind,o.title,o.body),
       updated_at=now()
  from public.membership_notifications o
 where t.kind='membership.manual-contact-officer'
   and t.read_at is null
   and t.title='Manual member contact required'
   and t.deduplication_key like 'membership-manual-contact-%'
   and o.id::text=substring(t.deduplication_key from 'membership-manual-contact-([0-9a-f-]{36})-');
