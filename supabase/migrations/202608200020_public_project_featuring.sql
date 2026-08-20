-- Owner-consented, committee-reviewed public snapshots of completed Workbench
-- projects. The member Workbench and its original photographs stay private.

create table public.member_project_feature_requests (
  project_id uuid primary key references public.member_projects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  show_owner_name boolean not null default false,
  owner_consented_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 500),
  updated_at timestamptz not null default now()
);

create table public.public_featured_projects (
  project_id uuid primary key references public.member_projects(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 120),
  summary text not null check (char_length(summary) between 10 and 1200),
  category text not null,
  completed_at timestamptz not null,
  owner_byline text not null check (char_length(owner_byline) between 2 and 120),
  cover_image_path text,
  published_at timestamptz not null default now(),
  constraint public_featured_projects_cover_path check (
    cover_image_path is null or (
      cover_image_path like 'projects/%'
      and cover_image_path not like '%..%'
      and position(chr(92) in cover_image_path) = 0
    )
  )
);

create table public.public_featured_project_updates (
  id uuid primary key,
  project_id uuid not null references public.public_featured_projects(project_id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 5000),
  help_type text,
  created_at timestamptz not null,
  sort_order integer not null check (sort_order >= 0)
);

create table public.public_featured_project_photos (
  id uuid primary key,
  update_id uuid not null references public.public_featured_project_updates(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 240),
  sort_order integer not null check (sort_order >= 0),
  constraint public_featured_project_photos_storage_path check (
    storage_path like 'projects/%'
    and storage_path not like '%..%'
    and position(chr(92) in storage_path) = 0
  )
);

create index member_project_feature_requests_status_idx
  on public.member_project_feature_requests(status, submitted_at desc);
create index public_featured_projects_published_idx
  on public.public_featured_projects(published_at desc);
create index public_featured_project_updates_project_idx
  on public.public_featured_project_updates(project_id, sort_order);
create index public_featured_project_photos_update_idx
  on public.public_featured_project_photos(update_id, sort_order);

alter table public.member_project_feature_requests enable row level security;
alter table public.public_featured_projects enable row level security;
alter table public.public_featured_project_updates enable row level security;
alter table public.public_featured_project_photos enable row level security;

create policy member_project_feature_requests_read
on public.member_project_feature_requests for select to authenticated
using (
  public.is_active_member()
  and (
    exists (
      select 1
      from public.member_projects project
      where project.id = project_id
        and project.owner_id = (select auth.uid())
    )
    or public.has_app_role(array['committee', 'administrator'])
  )
);

create policy public_featured_projects_read
on public.public_featured_projects for select to anon, authenticated
using (true);
create policy public_featured_project_updates_read
on public.public_featured_project_updates for select to anon, authenticated
using (true);
create policy public_featured_project_photos_read
on public.public_featured_project_photos for select to anon, authenticated
using (true);

revoke all on public.member_project_feature_requests,
  public.public_featured_projects,
  public.public_featured_project_updates,
  public.public_featured_project_photos
  from public, anon, authenticated;
grant select on public.member_project_feature_requests to authenticated;
grant select on public.public_featured_projects,
  public.public_featured_project_updates,
  public.public_featured_project_photos
  to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-project-images',
  'public-project-images',
  false,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.request_public_project_feature(
  p_project_id uuid,
  p_show_owner_name boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.member_projects%rowtype;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'not_authenticated';
  end if;

  select * into v_project
  from public.member_projects
  where id = p_project_id
  for update;

  if not found
    or v_project.owner_id is distinct from auth.uid()
    or v_project.project_status <> 'completed'
    or v_project.completed_at is null
    or v_project.archived_at is not null
  then
    raise exception 'project_not_eligible_for_public_feature';
  end if;

  insert into public.member_project_feature_requests (
    project_id,
    status,
    show_owner_name,
    owner_consented_at,
    submitted_at,
    reviewed_at,
    reviewed_by,
    review_note,
    updated_at
  ) values (
    p_project_id,
    'pending',
    coalesce(p_show_owner_name, false),
    now(),
    now(),
    null,
    null,
    '',
    now()
  )
  on conflict (project_id) do update
  set status = 'pending',
      show_owner_name = excluded.show_owner_name,
      owner_consented_at = now(),
      submitted_at = now(),
      reviewed_at = null,
      reviewed_by = null,
      review_note = '',
      updated_at = now();

  delete from public.public_featured_projects where project_id = p_project_id;
  return 'pending';
end;
$$;

create or replace function public.withdraw_public_project_feature(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_withdrawn boolean := false;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.member_projects project
    where project.id = p_project_id
      and project.owner_id = auth.uid()
  ) then
    raise exception 'project_not_owned';
  end if;

  update public.member_project_feature_requests
  set status = 'withdrawn',
      owner_consented_at = null,
      reviewed_at = null,
      reviewed_by = null,
      review_note = '',
      updated_at = now()
  where project_id = p_project_id;

  v_withdrawn := found;

  delete from public.public_featured_projects where project_id = p_project_id;
  return v_withdrawn;
end;
$$;

create or replace function public.reject_public_project_feature(
  p_project_id uuid,
  p_review_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.is_active_member()
    or not public.has_app_role(array['committee', 'administrator'])
  then
    raise exception 'not_authorized';
  end if;

  update public.member_project_feature_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = left(btrim(coalesce(p_review_note, '')), 500),
      updated_at = now()
  where project_id = p_project_id
    and status = 'pending'
    and owner_consented_at is not null;

  if not found then
    raise exception 'feature_request_not_pending';
  end if;

  delete from public.public_featured_projects where project_id = p_project_id;
  return true;
end;
$$;

create or replace function public.approve_public_project_feature(
  p_project_id uuid,
  p_cover_image_path text default null,
  p_photo_paths jsonb default '{}'::jsonb,
  p_review_note text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.member_projects%rowtype;
  v_request public.member_project_feature_requests%rowtype;
  v_slug text;
  v_owner_byline text;
  v_photo_count integer;
  v_mapped_photo_count integer;
begin
  if auth.uid() is null
    or not public.is_active_member()
    or not public.has_app_role(array['committee', 'administrator'])
  then
    raise exception 'not_authorized';
  end if;

  select * into v_project
  from public.member_projects
  where id = p_project_id
  for update;

  select * into v_request
  from public.member_project_feature_requests
  where project_id = p_project_id
  for update;

  if v_project.id is null
    or v_request.project_id is null
    or v_request.status <> 'pending'
    or v_request.owner_consented_at is null
    or v_project.project_status <> 'completed'
    or v_project.completed_at is null
    or v_project.archived_at is not null
  then
    raise exception 'feature_request_not_approvable';
  end if;

  if (v_project.cover_image_path is null) <> (p_cover_image_path is null) then
    raise exception 'public_cover_mapping_invalid';
  end if;

  if p_cover_image_path is not null and (
    p_cover_image_path not like ('projects/' || p_project_id::text || '/%')
    or p_cover_image_path like '%..%'
    or position(chr(92) in p_cover_image_path) <> 0
  ) then
    raise exception 'public_cover_mapping_invalid';
  end if;

  if jsonb_typeof(coalesce(p_photo_paths, '{}'::jsonb)) <> 'object' then
    raise exception 'public_photo_mapping_invalid';
  end if;

  select count(*) into v_photo_count
  from public.member_project_photos photo
  join public.member_project_updates project_update on project_update.id = photo.update_id
  where project_update.project_id = p_project_id;

  select count(*) into v_mapped_photo_count
  from public.member_project_photos photo
  join public.member_project_updates project_update on project_update.id = photo.update_id
  where project_update.project_id = p_project_id
    and coalesce(p_photo_paths, '{}'::jsonb) ? photo.id::text
    and (p_photo_paths ->> photo.id::text) like ('projects/' || p_project_id::text || '/%')
    and (p_photo_paths ->> photo.id::text) not like '%..%'
    and position(chr(92) in (p_photo_paths ->> photo.id::text)) = 0;

  if v_photo_count <> v_mapped_photo_count
    or v_photo_count <> (
      select count(*)
      from jsonb_object_keys(coalesce(p_photo_paths, '{}'::jsonb))
    )
  then
    raise exception 'public_photo_mapping_invalid';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_project.title), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'project'; end if;
  v_slug := v_slug || '-' || left(v_project.id::text, 8);

  select case
    when v_request.show_owner_name then coalesce(nullif(btrim(member.full_name), ''), 'Society member')
    else 'York Model Engineers member'
  end into v_owner_byline
  from public.users member
  where member.id = v_project.owner_id;

  delete from public.public_featured_projects where project_id = p_project_id;

  insert into public.public_featured_projects (
    project_id,
    slug,
    title,
    summary,
    category,
    completed_at,
    owner_byline,
    cover_image_path,
    published_at
  ) values (
    v_project.id,
    v_slug,
    v_project.title,
    v_project.summary,
    v_project.category,
    v_project.completed_at,
    coalesce(v_owner_byline, 'York Model Engineers member'),
    p_cover_image_path,
    now()
  );

  insert into public.public_featured_project_updates (
    id,
    project_id,
    title,
    body,
    help_type,
    created_at,
    sort_order
  )
  select
    project_update.id,
    project_update.project_id,
    project_update.title,
    project_update.body,
    project_update.help_type,
    project_update.created_at,
    row_number() over (order by project_update.created_at, project_update.id)::integer - 1
  from public.member_project_updates project_update
  where project_update.project_id = p_project_id;

  insert into public.public_featured_project_photos (
    id,
    update_id,
    storage_path,
    caption,
    sort_order
  )
  select
    photo.id,
    photo.update_id,
    p_photo_paths ->> photo.id::text,
    photo.caption,
    photo.sort_order
  from public.member_project_photos photo
  join public.member_project_updates project_update on project_update.id = photo.update_id
  where project_update.project_id = p_project_id;

  update public.member_project_feature_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = left(btrim(coalesce(p_review_note, '')), 500),
      updated_at = now()
  where project_id = p_project_id;

  return v_slug;
end;
$$;

revoke all on function public.request_public_project_feature(uuid, boolean) from public, anon, authenticated;
revoke all on function public.withdraw_public_project_feature(uuid) from public, anon, authenticated;
revoke all on function public.reject_public_project_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.approve_public_project_feature(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.request_public_project_feature(uuid, boolean) to authenticated;
grant execute on function public.withdraw_public_project_feature(uuid) to authenticated;
grant execute on function public.reject_public_project_feature(uuid, text) to authenticated;
grant execute on function public.approve_public_project_feature(uuid, text, jsonb, text) to authenticated;

create or replace function public.invalidate_public_project_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.member_project_feature_requests request_record
    where request_record.project_id = new.id
      and request_record.status in ('pending', 'approved')
  ) then
    delete from public.public_featured_projects where project_id = new.id;

    update public.member_project_feature_requests
    set status = case
          when new.owner_id is not null and new.project_status = 'completed' and new.archived_at is null then 'pending'
          else 'withdrawn'
        end,
        owner_consented_at = case
          when new.owner_id is not null and new.project_status = 'completed' and new.archived_at is null then owner_consented_at
          else null
        end,
        reviewed_at = null,
        reviewed_by = null,
        review_note = '',
        updated_at = now()
    where project_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.invalidate_public_project_feature() from public, anon, authenticated;

create trigger member_projects_invalidate_public_feature
after update of owner_id, title, summary, category, project_status, cover_image_path, archived_at
on public.member_projects
for each row
when (
  old.owner_id is distinct from new.owner_id
  or old.title is distinct from new.title
  or old.summary is distinct from new.summary
  or old.category is distinct from new.category
  or old.project_status is distinct from new.project_status
  or old.cover_image_path is distinct from new.cover_image_path
  or old.archived_at is distinct from new.archived_at
)
execute function public.invalidate_public_project_feature();

create or replace function public.invalidate_public_project_feature_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if tg_table_name = 'member_project_updates' then
    v_project_id := coalesce(new.project_id, old.project_id);
  else
    select project_update.project_id into v_project_id
    from public.member_project_updates project_update
    where project_update.id = coalesce(new.update_id, old.update_id);
  end if;

  if v_project_id is not null and exists (
    select 1
    from public.member_project_feature_requests request_record
    where request_record.project_id = v_project_id
      and request_record.status = 'approved'
  ) then
    delete from public.public_featured_projects where project_id = v_project_id;
    update public.member_project_feature_requests
    set status = 'pending',
        reviewed_at = null,
        reviewed_by = null,
        review_note = '',
        updated_at = now()
    where project_id = v_project_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_public_project_feature_content() from public, anon, authenticated;

create trigger member_project_updates_invalidate_public_feature
after insert or update or delete on public.member_project_updates
for each row execute function public.invalidate_public_project_feature_content();

create trigger member_project_photos_invalidate_public_feature
after insert or update or delete on public.member_project_photos
for each row execute function public.invalidate_public_project_feature_content();

comment on table public.member_project_feature_requests is
  'Private owner consent and committee review state for public Workbench features.';
comment on table public.public_featured_projects is
  'Sanitised public snapshots of owner-consented, committee-approved completed projects.';
comment on table public.public_featured_project_updates is
  'Public progress snapshot with no member identifiers or comments.';
comment on table public.public_featured_project_photos is
  'Approved photograph metadata copied into the private public-feature delivery bucket.';
