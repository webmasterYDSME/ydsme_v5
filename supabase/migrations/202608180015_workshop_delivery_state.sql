alter table public.participants
  add column if not exists notification_email_attempts integer not null default 0,
  add column if not exists notification_email_last_attempt_at timestamptz,
  add column if not exists notification_email_sent_at timestamptz,
  add column if not exists notification_email_error text;

alter table public.participants drop constraint if exists participants_notification_attempts_check;
alter table public.participants add constraint participants_notification_attempts_check
  check (notification_email_attempts >= 0);

create or replace function public.record_workshop_email_attempt(
  p_reservation_id bigint,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.participants
  set notification_email_attempts = notification_email_attempts + 1,
      notification_email_last_attempt_at = now(),
      notification_email_sent_at = case when p_sent then now() else notification_email_sent_at end,
      notification_email_error = case when p_sent then null else left(coalesce(p_error, 'Delivery failed.'), 500) end,
      updated_at = now()
  where id = p_reservation_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.record_workshop_email_attempt(bigint, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_workshop_email_attempt(bigint, boolean, text)
  to service_role;
