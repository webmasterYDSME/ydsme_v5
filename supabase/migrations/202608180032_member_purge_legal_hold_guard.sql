-- A membership-record legal hold must block both scheduled and manually
-- confirmed account deletion, even if the portal-profile hold is unset.

create or replace function public.anonymize_member_content_for_purge(
  p_user_id uuid,
  p_claim_token uuid default null,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.users%rowtype;
begin
  select * into v_target
  from public.users
  where id = p_user_id
  for update;

  if not found
    or v_target.membership_status <> 'archived'
    or v_target.legal_hold
    or exists (
      select 1 from public.membership_records mr
      where mr.auth_user_id = p_user_id and mr.legal_hold
    ) then
    raise exception 'member_purge_unavailable';
  end if;

  if p_claim_token is not null then
    if v_target.retention_purge_claim_token is distinct from p_claim_token then
      raise exception 'member_purge_claim_invalid';
    end if;
  elsif p_actor_id is not null then
    if not exists (
      select 1
      from public.users u
      join public.user_roles ur on ur.user_id = u.id
      where u.id = p_actor_id
        and u.membership_status = 'active'
        and ur.role = 'administrator'
    ) then
      raise exception 'member_purge_actor_invalid';
    end if;
  else
    raise exception 'member_purge_authorization_missing';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role in ('administrator', 'committee')
  ) or exists (
    select 1 from public.committees where user_id = p_user_id
  ) then
    raise exception 'member_purge_privileged_role';
  end if;

  update public.feeds
  set author_id = null,
      author_name = 'Former member',
      updated_at = now()
  where author_id = p_user_id;

  update public.documents set created_by = null where created_by = p_user_id;
  update public.workshops set created_by = null where created_by = p_user_id;
  update public.participants set participant_id = null where participant_id = p_user_id;
  update public.committees set created_by = null where created_by = p_user_id;

  return true;
end;
$$;

revoke all on function public.anonymize_member_content_for_purge(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.anonymize_member_content_for_purge(uuid, uuid, uuid)
  to service_role;
