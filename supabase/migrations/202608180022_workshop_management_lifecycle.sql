-- Keep workshop lifecycle state aligned with the programme without relying on
-- an administrator visiting the management page.
create or replace function public.archive_past_workshops()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_count integer;
begin
  update public.workshops
  set lifecycle_status = 'archived',
      archived_at = coalesce(archived_at, now()),
      archived_by = null,
      updated_at = now()
  where date < current_date
    and lifecycle_status <> 'archived';

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_past_workshops() from public, anon, authenticated;
grant execute on function public.archive_past_workshops() to service_role;

create or replace function public.archive_past_workshop_on_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date < current_date and new.lifecycle_status <> 'archived' then
    new.lifecycle_status := 'archived';
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.archive_past_workshop_on_write() from public, anon, authenticated;

drop trigger if exists archive_past_workshop_on_write on public.workshops;
create trigger archive_past_workshop_on_write
before insert or update of date, lifecycle_status on public.workshops
for each row execute function public.archive_past_workshop_on_write();

-- Archive existing past workshops when this migration is applied.
select public.archive_past_workshops();

select cron.schedule(
  'auto-archive-past-workshops',
  '15 1 * * *',
  $$select public.archive_past_workshops()$$
);
