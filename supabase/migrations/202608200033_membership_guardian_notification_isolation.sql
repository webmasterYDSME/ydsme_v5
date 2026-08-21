-- A guardian email must never be linked to the junior member's portal account
-- or suppressed when the member receives a combined activation/invitation.

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

  if new.recipient_email is not null and (
    v_contact_email is null or lower(new.recipient_email) <> v_contact_email
  ) then
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
    and (notification.recipient_email is null or (
      new.contact_email is not null
      and lower(notification.recipient_email) = lower(new.contact_email)
    ));
  return new;
end;
$$;

update public.membership_notifications notification
set recipient_user_id = null,
    portal_visible = false,
    updated_at = now()
from public.members member
where notification.member_id = member.id
  and notification.recipient_user_id = member.auth_user_id
  and notification.body like 'Guardian copy:%'
  and (member.contact_email is null
    or notification.recipient_email is distinct from member.contact_email);

