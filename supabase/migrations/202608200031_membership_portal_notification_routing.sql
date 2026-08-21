-- Route member-facing notices to a portal account as soon as one exists.
-- Application and guardian-only mail remains email-only.

create or replace function public.route_membership_notification_to_portal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_contact_email text;
begin
  if new.member_id is null or new.kind like '%-officer' then
    return new;
  end if;

  select member.auth_user_id, lower(member.contact_email)
  into v_auth_user_id, v_contact_email
  from public.members member
  where member.id = new.member_id;

  -- A guardian copy belongs in email only and must never be attached to the
  -- junior member's portal account.
  if new.recipient_email is not null and v_contact_email is not null
    and lower(new.recipient_email) <> v_contact_email then
    return new;
  end if;

  if new.kind in ('membership.activated', 'membership.honorary-activated') then
    new.portal_visible := true;
  end if;

  if new.portal_visible and new.recipient_user_id is null and v_auth_user_id is not null then
    new.recipient_user_id := v_auth_user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.route_membership_notification_to_portal() from public, anon, authenticated;
drop trigger if exists membership_notification_portal_routing on public.membership_notifications;
create trigger membership_notification_portal_routing
before insert on public.membership_notifications
for each row execute function public.route_membership_notification_to_portal();

create or replace function public.link_existing_membership_notifications_to_portal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null or new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  update public.membership_notifications notification
  set recipient_user_id = new.auth_user_id,
      portal_visible = case
        when notification.kind in ('membership.activated', 'membership.honorary-activated') then true
        else notification.portal_visible
      end,
      updated_at = now()
  where notification.member_id = new.id
    and notification.recipient_user_id is null
    and notification.kind not like '%-officer'
    and (notification.recipient_email is null
      or new.contact_email is null
      or lower(notification.recipient_email) = lower(new.contact_email));
  return new;
end;
$$;

revoke all on function public.link_existing_membership_notifications_to_portal() from public, anon, authenticated;
drop trigger if exists member_portal_notification_linking on public.members;
create trigger member_portal_notification_linking
after update of auth_user_id on public.members
for each row execute function public.link_existing_membership_notifications_to_portal();

-- Officer-created paid memberships previously had no activation notice at all.
create or replace function public.notify_officer_created_paid_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_plan_name text;
begin
  if new.source <> 'officer' or new.status <> 'paid' then
    return new;
  end if;

  select * into v_member from public.members where id = new.member_id;
  select plan.name into v_plan_name
  from public.membership_plan_prices price
  join public.membership_plans plan on plan.id = price.plan_id
  where price.id = new.plan_price_id;

  insert into public.membership_notifications(
    member_id, recipient_user_id, recipient_email, kind, title, body,
    action_href, portal_visible, deduplication_key
  ) values (
    new.member_id, v_member.auth_user_id, v_member.contact_email,
    'membership.activated', 'Your Society membership is active',
    format('Your %s membership for %s is active. The complete %s payment has been confirmed.',
      coalesce(v_plan_name, 'Society'), new.membership_year, replace(coalesce(new.expected_payment_method, 'offline'), '_', ' ')),
    '/account', true, 'membership-activated-' || new.member_id::text || '-' || new.membership_year::text
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;

revoke all on function public.notify_officer_created_paid_membership() from public, anon, authenticated;
drop trigger if exists officer_created_paid_membership_notification on public.membership_terms;
create trigger officer_created_paid_membership_notification
after insert on public.membership_terms
for each row execute function public.notify_officer_created_paid_membership();

-- Repair already-created member activation notices without exposing guardian
-- copies or application-stage email.
update public.membership_notifications notification
set portal_visible = true,
    recipient_user_id = coalesce(notification.recipient_user_id, member.auth_user_id),
    updated_at = now()
from public.members member
where notification.member_id = member.id
  and notification.kind in ('membership.activated', 'membership.honorary-activated')
  and (notification.recipient_email is null
    or member.contact_email is null
    or lower(notification.recipient_email) = lower(member.contact_email));

