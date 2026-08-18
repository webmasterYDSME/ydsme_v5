-- Follow-up metadata for explicit retention and retry-visible delivery state.

alter table public.users
  add column if not exists legal_hold boolean not null default false,
  add column if not exists retention_until timestamptz;

update public.users
set retention_until = coalesce(retention_until, archived_at + interval '12 months')
where membership_status = 'archived' and archived_at is not null;

alter table public.event_bookings
  add column if not exists confirmation_email_attempts integer not null default 0,
  add column if not exists confirmation_email_last_attempt_at timestamptz;

create or replace function public.record_event_booking_email_attempt(
  p_booking_id uuid,
  p_sent boolean,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.event_bookings
  set confirmation_email_attempts = confirmation_email_attempts + 1,
      confirmation_email_last_attempt_at = now(),
      confirmation_email_sent_at = case when p_sent then now() else confirmation_email_sent_at end,
      confirmation_email_error = case when p_sent then null else left(coalesce(p_error, 'Delivery failed'), 500) end,
      updated_at = now()
  where id = p_booking_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.record_event_booking_email_attempt(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_event_booking_email_attempt(uuid, boolean, text)
  to service_role;
