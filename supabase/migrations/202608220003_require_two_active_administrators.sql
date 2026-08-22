-- Keep two active administrators available for account recovery. The guarded
-- bootstrap still creates the first administrator on a fresh installation;
-- this protection applies when an administrator is subsequently archived.

create or replace function public.offboard_archived_administrative_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.membership_status='archived' and old.membership_status is distinct from new.membership_status then
    if exists(select 1 from public.user_roles where user_id=new.id and role='administrator')
      and (
        select count(*)
        from public.users u
        join public.user_roles r on r.user_id=u.id
        where r.role='administrator'
          and u.membership_status='active'
          and u.id<>new.id
      ) < 2 then
      raise exception 'minimum_two_active_administrators_required';
    end if;
    delete from public.user_capabilities where user_id=new.id and capability='memberships.manage';
    update public.user_roles set role='member' where user_id=new.id;
    update public.committees set user_id=null where user_id=new.id;
    update public.administrative_actors set status='former',ended_at=coalesce(ended_at,now()),updated_at=now()
      where auth_user_id=new.id;
    update public.membership_notifications set email_status='cancelled',read_at=coalesce(read_at,now()),updated_at=now()
      where recipient_user_id=new.id and kind like '%-officer' and read_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.offboard_archived_administrative_actor() from public, anon, authenticated;

comment on function public.offboard_archived_administrative_actor() is
  'Preserves officer history while preventing the number of active administrators from falling below two.';
