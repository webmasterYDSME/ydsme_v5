-- Email-less officer-managed members must create a manual contact task rather
-- than a permanently failing email delivery.

alter table public.membership_notifications drop constraint membership_notifications_check1;
alter table public.membership_notifications add constraint membership_notification_delivery_target_check check (
  recipient_email is not null
  or recipient_user_id is not null
  or (member_id is not null and email_status='cancelled' and not portal_visible)
);

create or replace function public.prepare_membership_notification_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_email is null and new.recipient_user_id is null then
    new.email_status := 'cancelled';
    new.portal_visible := false;
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_membership_notification_delivery() from public,anon,authenticated;
create trigger prepare_membership_notification_delivery before insert on public.membership_notifications
for each row execute function public.prepare_membership_notification_delivery();

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
    select new.member_id,officer.user_id,'membership.manual-contact-officer','Manual member contact required',
      'This member has no email or portal account. Contact them by their recorded offline method and record completion in the membership history.',
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
create trigger create_membership_manual_contact_task after insert on public.membership_notifications
for each row execute function public.create_membership_manual_contact_task();
