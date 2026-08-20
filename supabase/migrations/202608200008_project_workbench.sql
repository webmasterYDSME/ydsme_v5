-- Member-only project journals, progress updates, comments, follows and
-- private photographs for the Project Workbench.

create table public.member_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 120),
  summary text not null check (char_length(summary) between 10 and 1200),
  category text not null check (category in (
    'locomotive', 'rolling-stock', 'railway', 'workshop-tooling',
    'woodworking', 'electronics', '3d-printing', 'site-improvement', 'other'
  )),
  project_status text not null default 'planning' check (project_status in ('planning', 'in-progress', 'paused', 'completed')),
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  constraint member_projects_cover_path check (
    cover_image_path is null or (
      cover_image_path like 'projects/%'
      and cover_image_path not like '%..%'
      and position(chr(92) in cover_image_path) = 0
    )
  )
);

create table public.member_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.member_projects(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 5000),
  help_type text check (help_type is null or help_type in (
    'advice', 'tool-or-equipment', 'material', 'extra-pair-of-hands',
    'drawing-or-reference', 'specialist-skill', 'part-identification'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_project_photos (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.member_project_updates(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 240),
  sort_order smallint not null default 0 check (sort_order between 0 and 20),
  created_at timestamptz not null default now(),
  constraint member_project_photos_storage_path check (
    storage_path like 'projects/%'
    and storage_path not like '%..%'
    and position(chr(92) in storage_path) = 0
  )
);

create table public.member_project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.member_projects(id) on delete cascade,
  update_id uuid references public.member_project_updates(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 1500),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null
);

create table public.member_project_follows (
  project_id uuid not null references public.member_projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index member_projects_recent_idx on public.member_projects(updated_at desc) where archived_at is null;
create index member_projects_owner_idx on public.member_projects(owner_id, updated_at desc) where archived_at is null;
create index member_projects_filters_idx on public.member_projects(category, project_status, updated_at desc) where archived_at is null;
create index member_project_updates_project_idx on public.member_project_updates(project_id, created_at desc);
create index member_project_photos_update_idx on public.member_project_photos(update_id, sort_order);
create index member_project_comments_project_idx on public.member_project_comments(project_id, created_at) where archived_at is null;
create index member_project_follows_user_idx on public.member_project_follows(user_id, created_at desc);

alter table public.member_projects enable row level security;
alter table public.member_project_updates enable row level security;
alter table public.member_project_photos enable row level security;
alter table public.member_project_comments enable row level security;
alter table public.member_project_follows enable row level security;

create policy member_projects_read on public.member_projects for select to authenticated
using (
  public.is_active_member()
  and (archived_at is null or owner_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator']))
);
create policy member_projects_create on public.member_projects for insert to authenticated
with check (public.is_active_member() and owner_id = (select auth.uid()) and archived_at is null);
create policy member_projects_edit on public.member_projects for update to authenticated
using (public.is_active_member() and (owner_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])))
with check (public.is_active_member() and (owner_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])));

create policy member_project_updates_read on public.member_project_updates for select to authenticated
using (
  public.is_active_member()
  and exists (
    select 1 from public.member_projects project
    where project.id = project_id and (
      project.archived_at is null
      or project.owner_id = (select auth.uid())
      or public.has_app_role(array['committee', 'administrator'])
    )
  )
);
create policy member_project_updates_create on public.member_project_updates for insert to authenticated
with check (
  public.is_active_member()
  and author_id = (select auth.uid())
  and exists (
    select 1 from public.member_projects project
    where project.id = project_id and project.owner_id = (select auth.uid()) and project.archived_at is null
  )
);
create policy member_project_updates_edit on public.member_project_updates for update to authenticated
using (public.is_active_member() and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])))
with check (public.is_active_member() and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])));

create policy member_project_photos_read on public.member_project_photos for select to authenticated
using (
  public.is_active_member()
  and exists (
    select 1 from public.member_project_updates update_record
    join public.member_projects project on project.id = update_record.project_id
    where update_record.id = update_id and (
      project.archived_at is null
      or project.owner_id = (select auth.uid())
      or public.has_app_role(array['committee', 'administrator'])
    )
  )
);
create policy member_project_photos_create on public.member_project_photos for insert to authenticated
with check (
  public.is_active_member()
  and exists (
    select 1 from public.member_project_updates update_record
    join public.member_projects project on project.id = update_record.project_id
    where update_record.id = update_id and project.owner_id = (select auth.uid()) and project.archived_at is null
  )
);

create policy member_project_comments_read on public.member_project_comments for select to authenticated
using (
  public.is_active_member()
  and archived_at is null
  and exists (select 1 from public.member_projects project where project.id = project_id and project.archived_at is null)
);
create policy member_project_comments_create on public.member_project_comments for insert to authenticated
with check (
  public.is_active_member()
  and author_id = (select auth.uid())
  and archived_at is null
  and exists (select 1 from public.member_projects project where project.id = project_id and project.archived_at is null)
);
create policy member_project_comments_moderate on public.member_project_comments for update to authenticated
using (public.is_active_member() and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])))
with check (public.is_active_member() and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator'])));

create policy member_project_follows_read on public.member_project_follows for select to authenticated
using (public.is_active_member());
create policy member_project_follows_create on public.member_project_follows for insert to authenticated
with check (
  public.is_active_member()
  and user_id = (select auth.uid())
  and exists (select 1 from public.member_projects project where project.id = project_id and project.archived_at is null)
);
create policy member_project_follows_remove on public.member_project_follows for delete to authenticated
using (public.is_active_member() and user_id = (select auth.uid()));

revoke all on public.member_projects, public.member_project_updates, public.member_project_photos,
  public.member_project_comments, public.member_project_follows from public, anon, authenticated;
grant select, insert, update on public.member_projects, public.member_project_updates,
  public.member_project_photos, public.member_project_comments to authenticated;
grant select, insert, delete on public.member_project_follows to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  false,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy ydsme_member_project_images_read on storage.objects for select to authenticated
using (
  bucket_id = 'project-images'
  and name not like 'quarantine/%'
  and public.is_active_member()
);

comment on table public.member_projects is 'Member-only Project Workbench journals.';
comment on table public.member_project_updates is 'Chronological progress entries written by project owners.';
comment on table public.member_project_comments is 'Member discussion attached to Workbench projects and updates.';
