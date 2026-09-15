-- Save administrator name corrections atomically with account access and audit.
create or replace function public.save_people_management(p_actor_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid := nullif(p_input->>'user_id','')::uuid;
  listing_id bigint := nullif(p_input->>'listing_id','')::bigint;
  new_role text := p_input->>'role';
  officer boolean := coalesce((p_input->>'officer')::boolean,false);
  has_listing boolean := coalesce((p_input->>'has_listing')::boolean,false);
  old_role text;
  old_full_name text;
  new_full_name text := btrim(p_input->>'full_name');
  before_listing jsonb;
  before_officer boolean;
  before_listings jsonb;
  old_path text;
begin
  -- Serialize privilege changes, including the minimum-administrator check.
  lock table public.user_roles in share row exclusive mode;
  if not exists(select 1 from public.user_roles r join public.users u on u.id=r.user_id
    where r.user_id=p_actor_id and r.role='administrator' and u.membership_status='active') then
    raise exception 'Administrator access is required.';
  end if;
  if target_id is not null then
    select r.role::text into old_role from public.user_roles r join public.users u on u.id=r.user_id
      where r.user_id=target_id and u.membership_status='active' for update of r;
    if old_role is null then raise exception 'Restore this account before managing access.'; end if;
    if new_role not in ('member','committee','administrator') or new_role is null then raise exception 'Choose a valid role.'; end if;
    if old_role is distinct from p_input->>'expected_role' then raise exception 'The role changed. Refresh the page before saving.'; end if;
    if target_id=p_actor_id and new_role<>old_role then raise exception 'You cannot change your own role.'; end if;
    if old_role='administrator' and new_role<>'administrator' and
      (select count(*) from public.user_roles r join public.users u on u.id=r.user_id where r.role='administrator' and u.membership_status='active')<=2 then
      raise exception 'At least two active administrators are required.';
    end if;
    if officer and new_role<>'committee' then raise exception 'Membership access can only be assigned to committee accounts.'; end if;
    if has_listing and new_role='member' then raise exception 'A linked committee listing needs Committee or Administrator access.'; end if;
    if p_input ? 'full_name' then
      if new_full_name is null or char_length(new_full_name) not between 2 and 180 then
        raise exception 'Enter a valid full name.';
      end if;
      select full_name into old_full_name from public.users where id=target_id for update;
      if coalesce(old_full_name,'') is distinct from p_input->>'expected_full_name' then
        raise exception 'The name changed. Refresh the page before saving.';
      end if;
    end if;
    select exists(select 1 from public.user_capabilities where user_id=target_id and capability='memberships.manage') into before_officer;
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into before_listings from public.committees c where user_id=target_id;
  elsif officer then raise exception 'Choose a committee account before granting membership access.';
  end if;

  if listing_id is not null then
    select to_jsonb(c) into before_listing from public.committees c where id=listing_id for update;
    if before_listing is null then raise exception 'The committee position no longer exists.'; end if;
    if before_listing->>'updated_at' is distinct from p_input->>'listing_updated_at' then
      -- Compare timestamps, as JSON and PostgREST can format the same value differently.
      if (before_listing->>'updated_at')::timestamptz is distinct from (p_input->>'listing_updated_at')::timestamptz then
        raise exception 'The committee listing changed. Refresh the page before saving.';
      end if;
    end if;
    old_path := before_listing->>'file_url';
  end if;

  if target_id is not null then
    if p_input ? 'full_name' and new_full_name is distinct from old_full_name then
      update public.users set full_name=new_full_name,updated_at=now() where id=target_id;
      update public.members set full_name=new_full_name,updated_at=now() where auth_user_id=target_id;
    end if;
    update public.user_roles set role=new_role where user_id=target_id;
    if officer then
      insert into public.user_capabilities(user_id,capability,granted_by) values(target_id,'memberships.manage',p_actor_id)
      on conflict(user_id,capability) do nothing;
    else delete from public.user_capabilities where user_id=target_id and capability='memberships.manage';
    end if;
  end if;
  if has_listing then
    if length(trim(p_input->>'title')) not between 2 and 180 then raise exception 'Enter a committee position.'; end if;
    if listing_id is null then
      insert into public.committees(name,title,email,file_url,user_id,is_public,position,created_by)
      values(p_input->>'name',p_input->>'title',p_input->>'email',coalesce(p_input->>'file_url',''),target_id,
        (p_input->>'is_public')::boolean,(p_input->>'position')::integer,p_actor_id) returning id into listing_id;
    else
      update public.committees set name=p_input->>'name',title=p_input->>'title',email=p_input->>'email',
        file_url=coalesce(p_input->>'file_url',old_path,''),user_id=target_id,is_public=(p_input->>'is_public')::boolean,
        position=(p_input->>'position')::integer,updated_at=now() where id=listing_id;
    end if;
  elsif listing_id is not null then
    update public.committees set is_public=false,user_id=null,updated_at=now() where id=listing_id;
  end if;

  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state)
  values(p_actor_id,'administrator','people.management-updated',case when target_id is null then 'committee-record' else 'member' end,
    coalesce(target_id::text,listing_id::text),'Account access and committee listing updated',
    jsonb_build_object('full_name',old_full_name,'role',old_role,'officer',before_officer,'listing',before_listing,'linked_listings',before_listings),
    jsonb_build_object('full_name',coalesce(new_full_name,old_full_name),'role',new_role,'officer',officer,'listing_id',listing_id,'has_listing',has_listing,
      'listing',(select to_jsonb(c) from public.committees c where id=listing_id)));
  return jsonb_build_object('listing_id',listing_id,'old_path',old_path);
end;
$$;
revoke all on function public.save_people_management(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_people_management(uuid,jsonb) to service_role;
