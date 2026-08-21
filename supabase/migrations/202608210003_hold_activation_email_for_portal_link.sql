-- A paid activation may need either a first portal invitation or an activation
-- email for an existing account. Hold the member's activation email until the
-- application layer has linked or created the portal identity, avoiding two
-- competing emails after immediate outbox dispatch was enabled.

create or replace function public.hold_member_activation_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_contact_email text;
begin
  if new.kind <> 'membership.activated' or new.member_id is null then
    return new;
  end if;

  select lower(member.contact_email) into v_contact_email
  from public.members member where member.id = new.member_id;

  -- Guardian copies remain normal email-only notifications.
  if new.recipient_email is not null
    and v_contact_email is not null
    and lower(new.recipient_email) = v_contact_email then
    new.email_status := 'cancelled';
  end if;
  return new;
end;
$$;

revoke all on function public.hold_member_activation_email() from public, anon, authenticated;

create or replace trigger a_hold_member_activation_email
before insert on public.membership_notifications
for each row execute function public.hold_member_activation_email();
