-- Public API consumers receive purpose-built projections rather than every
-- column in operational tables (for example host/member UUIDs).
create or replace view public.public_events
with (security_barrier = true)
as
select
  id, name, descriptions, file_url, start_date, end_date, start_time, end_time,
  event_type, display_in_homepage, is_ticket_required, reservation_link,
  booking_enabled, booking_mode, booking_capacity, lifecycle_status
from public.events
where event_type = 'public' and lifecycle_status = 'published';

create or replace view public.public_committee_roster
with (security_barrier = true)
as
select id, name, title, file_url, email
from public.committees;

revoke all on public.public_events, public.public_committee_roster from public, anon, authenticated;
grant select on public.public_events, public.public_committee_roster to anon, authenticated;
revoke select on public.events, public.committees from anon;

-- Members receive only portal-facing columns when accessing PostgREST
-- directly. Administrative screens read minimal DTOs through the server DAL.
revoke select on public.events, public.documents, public.workshops, public.committees from authenticated;
grant select (
  id, name, descriptions, file_url, start_date, end_date, start_time, end_time,
  event_type, display_in_homepage, is_ticket_required, reservation_link,
  booking_enabled, booking_mode, booking_capacity, lifecycle_status
) on public.events to authenticated;
grant select (
  id, category, name, descriptions, file_url, created_at, lifecycle_status,
  version, updated_at
) on public.documents to authenticated;
grant select (
  id, title, descriptions, notes, date, start_time, end_time, host_name, venue,
  virtual_link, maximum_participants, lifecycle_status, created_at, updated_at
) on public.workshops to authenticated;
