-- Member inbox reads and updates must match both the authenticated portal user
-- and that user's canonical member record. A stale recipient link alone is not
-- sufficient to expose a notice.

create or replace function public.get_own_membership_notifications(p_limit integer default 20)
returns table(
  id uuid,
  title text,
  body text,
  kind text,
  action_href text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.title, notification.body,
    notification.kind, notification.action_href, notification.read_at,
    notification.created_at
  from public.membership_notifications notification
  join public.members member on member.id = notification.member_id
  where auth.uid() is not null
    and member.auth_user_id = auth.uid()
    and notification.recipient_user_id = auth.uid()
    and notification.portal_visible
  order by notification.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.mark_own_membership_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.membership_notifications notification
  set read_at = coalesce(notification.read_at, now()), updated_at = now()
  where notification.id = p_notification_id
    and notification.recipient_user_id = auth.uid()
    and notification.portal_visible
    and exists (
      select 1 from public.members member
      where member.id = notification.member_id
        and member.auth_user_id = auth.uid()
    );
  return found;
end;
$$;

revoke all on function public.get_own_membership_notifications(integer) from public, anon;
revoke all on function public.mark_own_membership_notification_read(uuid) from public, anon;
grant execute on function public.get_own_membership_notifications(integer) to authenticated;
grant execute on function public.mark_own_membership_notification_read(uuid) to authenticated;
