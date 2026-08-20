-- Deterministic portal/email notices for grace, lapse and reinstatement state
-- changes. Junior financial notices are copied to the recorded guardian.

create or replace function public.notify_membership_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.effective_state=old.effective_state then return new; end if;
  if new.effective_state='grace' then
    v_kind:='membership.grace'; v_title:='Your membership is in its grace period';
    v_body:='Portal access continues through February. Complete renewal before 1 March to avoid a lapse.';
  elsif new.effective_state='lapsed' then
    v_kind:='membership.lapsed'; v_title:='Your membership has lapsed';
    v_body:='The renewal grace period has ended and portal access is now closed. A full Stripe or cash renewal can reinstate membership.';
  elsif new.effective_state='active' and old.effective_state in ('grace','lapsed','payment_review') then
    v_kind:='membership.reinstated'; v_title:='Your membership is active again';
    v_body:='Your paid membership and portal access have been reinstated.';
  else return new;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    new.id,new.auth_user_id,new.contact_email,v_kind,v_title,v_body,'/account',
    'membership-state-' || new.id::text || '-' || new.effective_state || '-' || current_date::text
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;
drop trigger if exists membership_state_change_notification on public.members;
create trigger membership_state_change_notification
after update of effective_state on public.members
for each row execute function public.notify_membership_state_change();

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
      'membership.auto-renew-changed','membership.grace','membership.lapsed','membership.reinstated'
    ) then return new; end if;
  select member.guardian_email into v_guardian_email
  from public.members member join public.membership_plans plan on plan.id=member.current_plan_id
  where member.id=new.member_id and plan.slug='junior';
  if v_guardian_email is null or lower(v_guardian_email)=lower(new.recipient_email) then return new; end if;
  insert into public.membership_notifications(
    member_id,recipient_email,kind,title,body,action_href,portal_visible,scheduled_for,deduplication_key
  ) values (
    new.member_id,lower(v_guardian_email),new.kind,new.title,'Guardian copy: '||new.body,
    new.action_href,false,new.scheduled_for,left(new.deduplication_key||'-guardian',180)
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;
