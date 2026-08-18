-- Keep event lifecycle state aligned with the timetable without relying on an
-- administrator visiting the management page.
create or replace function public.archive_past_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_count integer;
begin
  update public.events
  set lifecycle_status = 'archived',
      archived_at = coalesce(archived_at, now()),
      archived_by = null,
      updated_at = now()
  where end_date < current_date
    and lifecycle_status <> 'archived';

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_past_events() from public, anon, authenticated;
grant execute on function public.archive_past_events() to service_role;

create or replace function public.archive_past_event_on_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.end_date < current_date and new.lifecycle_status <> 'archived' then
    new.lifecycle_status := 'archived';
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.archive_past_event_on_write() from public, anon, authenticated;

drop trigger if exists archive_past_event_on_write on public.events;
create trigger archive_past_event_on_write
before insert or update of end_date, lifecycle_status on public.events
for each row execute function public.archive_past_event_on_write();

-- Retire external reservations. Existing external events become no-booking
-- events and can be deliberately switched to website booking by a manager.
update public.events
set booking_mode = 'none',
    booking_enabled = false,
    is_ticket_required = false,
    booking_capacity = null,
    reservation_link = '',
    updated_at = now()
where booking_mode = 'external';

update public.events
set reservation_link = ''
where reservation_link <> '';

alter table public.events drop constraint if exists events_booking_mode_check;
alter table public.events add constraint events_booking_mode_check
  check (booking_mode in ('none', 'website'));

-- Archive existing past events when this migration is applied.
select public.archive_past_events();

-- Supabase Cron keeps this database-owned lifecycle rule close to the data.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'auto-archive-past-events',
  '10 1 * * *',
  $$select public.archive_past_events()$$
);

select cron.schedule(
  'dashboard-data-retention',
  '17 2 * * *',
  $$select public.run_dashboard_retention()$$
);

-- Store `project_url` and `maintenance_secret_key` in Supabase Vault before
-- this job's first run. The Edge Function accepts secret-key calls only.
select cron.schedule(
  'cleanup-quarantine-uploads',
  '17 3 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/cleanup-quarantine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret_key' limit 1)
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    ) as request_id
  $job$
);
