-- YCDSME least-privilege hardening.
-- Review in a Supabase branch/local environment before applying to production.

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and role::text = any(allowed_roles)
  );
$$;

revoke all on function public.has_app_role(text[]) from public;
grant execute on function public.has_app_role(text[]) to authenticated;

-- Anonymous clients only receive public events. Signed-in members receive the full timetable.
drop policy if exists "Enable read access for all users" on public.events;
drop policy if exists "Enable update for mod, committee and admin" on public.events;
drop policy if exists "Enable insert for committee and administrator" on public.events;
drop policy if exists "Enable delete for mod, committees and amin" on public.events;
drop policy if exists "ydsme_events_public_read" on public.events;
drop policy if exists "ydsme_events_member_read" on public.events;
drop policy if exists "ydsme_events_manager_insert" on public.events;
drop policy if exists "ydsme_events_manager_update" on public.events;
drop policy if exists "ydsme_events_manager_delete" on public.events;

create policy "ydsme_events_public_read" on public.events for select to anon
using (event_type = 'public'::public.event_type);
create policy "ydsme_events_member_read" on public.events for select to authenticated
using (true);
create policy "ydsme_events_manager_insert" on public.events for insert to authenticated
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_events_manager_update" on public.events for update to authenticated
using ((select public.has_app_role(array['administrator','committee'])))
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_events_manager_delete" on public.events for delete to authenticated
using ((select public.has_app_role(array['administrator','committee'])));

revoke insert, update, delete, truncate on public.events from anon;

-- Read-only committee accounts can inspect these records, never mutate them.
drop policy if exists "Enable delete for committees and admin" on public.workshops;
drop policy if exists "Enable insert for committees and admin only" on public.workshops;
drop policy if exists "Enable update for committees and admin" on public.workshops;
drop policy if exists "ydsme_workshops_manager_insert" on public.workshops;
drop policy if exists "ydsme_workshops_manager_update" on public.workshops;
drop policy if exists "ydsme_workshops_manager_delete" on public.workshops;
create policy "ydsme_workshops_manager_insert" on public.workshops for insert to authenticated
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_workshops_manager_update" on public.workshops for update to authenticated
using ((select public.has_app_role(array['administrator','committee'])))
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_workshops_manager_delete" on public.workshops for delete to authenticated
using ((select public.has_app_role(array['administrator','committee'])));

drop policy if exists "Enable delete for committees and admin" on public.documents;
drop policy if exists "Enable insert for committees and admin" on public.documents;
drop policy if exists "ydsme_documents_manager_insert" on public.documents;
drop policy if exists "ydsme_documents_manager_update" on public.documents;
drop policy if exists "ydsme_documents_manager_delete" on public.documents;
create policy "ydsme_documents_manager_insert" on public.documents for insert to authenticated
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_documents_manager_update" on public.documents for update to authenticated
using ((select public.has_app_role(array['administrator','committee'])))
with check ((select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_documents_manager_delete" on public.documents for delete to authenticated
using ((select public.has_app_role(array['administrator','committee'])));

-- Messages: members may remove their own; content managers may moderate.
drop policy if exists "Enable delete for members based on author_id" on public.feeds;
drop policy if exists "Enable delete for admin, mod and committees" on public.feeds;
drop policy if exists "ydsme_feeds_delete" on public.feeds;
create policy "ydsme_feeds_delete" on public.feeds for delete to authenticated
using ((select auth.uid()) = author_id or (select public.has_app_role(array['administrator','committee'])));

-- Storage remains readable as before, but writes are limited to content managers.
drop policy if exists "Only authenticated user can upload 1ffg0oo_0" on storage.objects;
drop policy if exists "Only authenticated user can upload 1ffg0oo_1" on storage.objects;
drop policy if exists "Only authenticated user can upload 1ffg0oo_2" on storage.objects;
drop policy if exists "Allow committees and admin to upload flreew_0" on storage.objects;
drop policy if exists "Allow committees and admin to upload flreew_1" on storage.objects;
drop policy if exists "Allow committees and admin to upload flreew_2" on storage.objects;
drop policy if exists "ydsme_manager_storage_insert" on storage.objects;
drop policy if exists "ydsme_manager_storage_update" on storage.objects;
drop policy if exists "ydsme_manager_storage_delete" on storage.objects;

create policy "ydsme_manager_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id in ('images','documents') and (select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_manager_storage_update" on storage.objects for update to authenticated
using (bucket_id in ('images','documents') and (select public.has_app_role(array['administrator','committee'])))
with check (bucket_id in ('images','documents') and (select public.has_app_role(array['administrator','committee'])));
create policy "ydsme_manager_storage_delete" on storage.objects for delete to authenticated
using (bucket_id in ('images','documents') and (select public.has_app_role(array['administrator','committee'])));

-- Prevent duplicate reservations and prevent members from reserving on another account.
create unique index if not exists participants_workshop_member_unique
on public.participants(reference_id, participant_id);
drop policy if exists "Enable insert for authenticated members only" on public.participants;
drop policy if exists "ydsme_participants_insert_self" on public.participants;
create policy "ydsme_participants_insert_self" on public.participants for insert to authenticated
with check ((select auth.uid()) = participant_id);
