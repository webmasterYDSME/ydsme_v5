-- Website access is decided by users.membership_status, while the membership record holds its own state.
-- Several paths changed one without the other:
--  * Removing or moving a member's website login left that person able to use the members' area.
--  * Linking a login to a member did not look at the member's state, so a lapsed member's new login
--    could open the members' area, and an active member's could stay locked.
-- This keeps the two in step whenever a member's state or login changes. It only moves access between
-- active and lapsed/suspended, so suspended and archived accounts are never reopened by it, and it never
-- lapses or suspends an administrator, so the Society cannot be left without one.

create or replace function public.sync_user_access_from_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  -- A login that no longer belongs to any membership stops having members' access,
  -- unless it holds an officer role or a committee listing.
  if tg_op = 'UPDATE' and old.auth_user_id is not null and old.auth_user_id is distinct from new.auth_user_id then
    if not exists (select 1 from public.members other where other.auth_user_id = old.auth_user_id and other.id <> old.id)
      and not exists (select 1 from public.user_roles ur where ur.user_id = old.auth_user_id and ur.role <> 'member')
      and not exists (select 1 from public.committees cm where cm.user_id = old.auth_user_id) then
      update public.users set membership_status = 'suspended', updated_at = now()
      where id = old.auth_user_id and membership_status in ('active', 'lapsed');
    end if;
  end if;

  if new.auth_user_id is null then return new; end if;
  v_state := new.effective_state;

  if v_state in ('active', 'grace', 'payment_review', 'honorary') then
    update public.users set membership_status = 'active', updated_at = now()
    where id = new.auth_user_id and membership_status = 'lapsed';
  elsif v_state in ('lapsed', 'suspended') then
    update public.users set membership_status = v_state, updated_at = now()
    where id = new.auth_user_id and membership_status in ('active', 'lapsed')
      and membership_status <> v_state
      and not exists (select 1 from public.user_roles ur where ur.user_id = new.auth_user_id and ur.role = 'administrator');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_user_access_from_member() from public, anon, authenticated;

drop trigger if exists sync_user_access_after_member_insert on public.members;
create trigger sync_user_access_after_member_insert after insert on public.members
  for each row when (new.auth_user_id is not null) execute function public.sync_user_access_from_member();

drop trigger if exists sync_user_access_after_member_change on public.members;
create trigger sync_user_access_after_member_change after update of effective_state, auth_user_id on public.members
  for each row when (old.effective_state is distinct from new.effective_state or old.auth_user_id is distinct from new.auth_user_id)
  execute function public.sync_user_access_from_member();
