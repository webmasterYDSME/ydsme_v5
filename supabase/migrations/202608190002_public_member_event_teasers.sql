-- Selected member-only events may be promoted publicly without exposing the
-- full private timetable or operational event fields.
alter table public.events
  add column if not exists public_teaser_enabled boolean not null default false;

comment on column public.events.public_teaser_enabled is
  'Explicitly allows a published member-only event to appear as a public membership teaser.';

create or replace view public.public_member_event_teasers
with (security_barrier = true)
as
select
  id, name, descriptions, file_url, start_date, end_date, start_time, end_time
from public.events
where event_type = 'member_only'
  and lifecycle_status = 'published'
  and public_teaser_enabled = true;

revoke all on public.public_member_event_teasers from public, anon, authenticated;
grant select on public.public_member_event_teasers to anon, authenticated;
