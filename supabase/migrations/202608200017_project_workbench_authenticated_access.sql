-- Keep ordinary Workbench reads and writes inside the signed-in member's RLS session.
-- Only image quarantine validation and promotion need an elevated storage client.

create or replace function public.workbench_member_names(p_user_ids uuid[])
returns table(id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_member() then
    raise exception 'membership_inactive';
  end if;

  return query
  select
    member.id,
    coalesce(nullif(btrim(member.full_name), ''), 'Society member')
  from public.users as member
  where member.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and member.membership_status = 'active'
    and (
      exists (
        select 1
        from public.member_projects as project
        where project.owner_id = member.id
          and project.archived_at is null
      )
      or exists (
        select 1
        from public.member_project_comments as comment_record
        join public.member_projects as project on project.id = comment_record.project_id
        where comment_record.author_id = member.id
          and comment_record.archived_at is null
          and project.archived_at is null
      )
    );
end;
$$;

create or replace function public.create_member_project_update(
  p_project_id uuid,
  p_title text,
  p_body text,
  p_help_type text,
  p_photo_paths text[] default array[]::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_update_id uuid;
  v_path text;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_member() then
    raise exception 'membership_inactive';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) > 5 then
    raise exception 'too_many_photos';
  end if;

  insert into public.member_project_updates (
    project_id,
    author_id,
    title,
    body,
    help_type
  )
  values (
    p_project_id,
    auth.uid(),
    p_title,
    p_body,
    nullif(p_help_type, '')
  )
  returning id into v_update_id;

  foreach v_path in array coalesce(p_photo_paths, array[]::text[])
  loop
    if v_path is null
      or v_path not like 'projects/%'
      or v_path like '%..%'
      or position(chr(92) in v_path) <> 0
    then
      raise exception 'invalid_photo_path';
    end if;

    insert into public.member_project_photos (
      update_id,
      storage_path,
      sort_order
    )
    values (
      v_update_id,
      v_path,
      v_position
    );

    v_position := v_position + 1;
  end loop;

  update public.member_projects
  set updated_at = now()
  where id = p_project_id;

  return v_update_id;
end;
$$;

revoke all on function public.workbench_member_names(uuid[]) from public, anon, authenticated;
revoke all on function public.create_member_project_update(uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.workbench_member_names(uuid[]) to authenticated;
grant execute on function public.create_member_project_update(uuid, text, text, text, text[]) to authenticated;

-- This supersedes 202608200016 now that every table query uses the authenticated client.
revoke select, insert, update, delete on table public.member_projects from service_role;
revoke select, insert, update, delete on table public.member_project_updates from service_role;
revoke select, insert, update, delete on table public.member_project_photos from service_role;
revoke select, insert, update, delete on table public.member_project_comments from service_role;
revoke select, insert, update, delete on table public.member_project_follows from service_role;

comment on function public.workbench_member_names(uuid[]) is
  'Returns the minimum member identity needed by the authenticated Workbench UI.';
comment on function public.create_member_project_update(uuid, text, text, text, text[]) is
  'Atomically records an owner-authored progress update and its promoted image paths under RLS.';
