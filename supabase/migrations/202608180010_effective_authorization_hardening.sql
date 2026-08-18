-- Enforce application membership status at the database boundary. Supabase
-- Auth proves identity; this function proves the account may use the portal.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and membership_status = 'active'
  );
$$;

revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated, service_role;

drop policy if exists ydsme_documents_member_read on public.documents;
create policy ydsme_documents_member_read on public.documents for select to authenticated
using (public.is_active_member() and lifecycle_status = 'published');

drop policy if exists ydsme_events_member_read on public.events;
create policy ydsme_events_member_read on public.events for select to authenticated
using (public.is_active_member() and lifecycle_status <> 'archived');

drop policy if exists ydsme_feeds_read_active on public.feeds;
create policy ydsme_feeds_read_active on public.feeds for select to authenticated
using (public.is_active_member() and lifecycle_status = 'published');

drop policy if exists ydsme_feeds_insert_message on public.feeds;
create policy ydsme_feeds_insert_message on public.feeds for insert to authenticated
with check (
  public.is_active_member()
  and type = 'message'
  and author_id = (select auth.uid())
  and lifecycle_status = 'published'
);

drop policy if exists ydsme_feeds_archive on public.feeds;
create policy ydsme_feeds_archive on public.feeds for update to authenticated
using (
  public.is_active_member()
  and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator']))
)
with check (
  public.is_active_member()
  and (author_id = (select auth.uid()) or public.has_app_role(array['committee', 'administrator']))
);

drop policy if exists ydsme_participants_select_self on public.participants;
create policy ydsme_participants_select_self on public.participants for select to authenticated
using (public.is_active_member() and participant_id = (select auth.uid()));

drop policy if exists ydsme_workshops_member_read on public.workshops;
create policy ydsme_workshops_member_read on public.workshops for select to authenticated
using (public.is_active_member() and lifecycle_status <> 'archived');

create or replace function public.cancel_workshop_place(p_workshop_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member() then raise exception 'membership_inactive'; end if;
  update public.participants
  set reservation_status = 'cancelled', cancelled_at = now(), updated_at = now()
  where reference_id = p_workshop_id
    and participant_id = auth.uid()
    and reservation_status = 'reserved';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Quarantine objects must remain private even when their destination bucket is
-- public. Documents also require active application membership, not only a
-- valid Supabase session.
drop policy if exists "Allow all to access the images 1ffg0oo_0" on storage.objects;
create policy ydsme_public_final_images on storage.objects for select to public
using (bucket_id = 'images' and name not like 'quarantine/%');

drop policy if exists "Select access to authenticated members flreew_0" on storage.objects;
create policy ydsme_active_member_documents on storage.objects for select to authenticated
using (bucket_id = 'documents' and public.is_active_member() and name not like 'quarantine/%');

-- Remove legacy table capabilities that RLS does not protect (notably
-- TRUNCATE), then restore only the operations supported by explicit policies.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

revoke select on public.documents, public.feeds, public.participants, public.workshops from anon;
grant select on public.events, public.committees, public.products, public.prices to anon;
grant select on public.events, public.committees, public.products, public.prices,
  public.documents, public.feeds, public.participants, public.workshops, public.subscriptions,
  public.users to authenticated;
grant insert, update, delete on public.events, public.documents, public.workshops to authenticated;
grant insert, update on public.feeds to authenticated;
grant update on public.users to authenticated;

revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Trigger and legacy definer
-- functions must not be callable as arbitrary RPC endpoints.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_app_role(text[]) to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.reserve_workshop_place(uuid) to authenticated;
grant execute on function public.cancel_workshop_place(uuid) to authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.create_event_booking(bigint, text, text, integer, text) to service_role;
grant execute on function public.record_event_booking_email_attempt(uuid, boolean, text) to service_role;
grant execute on function public.replace_public_site_links(jsonb, jsonb) to service_role;
grant execute on function public.replace_donation_campaigns(jsonb, jsonb) to service_role;
grant execute on function public.run_dashboard_retention() to service_role;
grant execute on function public.target_donation_total_pence() to service_role;

-- Harden the two retained trigger functions that pre-date the secure dashboard.
alter function public.new_document_feeds() set search_path = '';
alter function public.new_user_feeds() set search_path = '';
