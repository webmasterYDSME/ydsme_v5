-- A Junior's guardian is copied on money-related notices while the guardian still has authority.
-- The list stopped at the older automatic renewal reminders (which are switched off) and missed the
-- renewal invitation and reminder that officers now send, so a guardian was not copied on the
-- message that actually asks for the renewal payment.

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
      'membership.renewal-failed','membership.payment-action-required','membership.price-changed',
      'membership.renewal-invitation','membership.renewal-reminder') then
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
