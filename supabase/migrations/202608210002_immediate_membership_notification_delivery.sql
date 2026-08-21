-- Dispatch actionable membership emails as soon as they are committed. Cron is
-- retained as a short-interval recovery path for transient delivery failures.

create or replace function public.request_membership_notification_delivery()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_maintenance_key text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_maintenance_key
  from vault.decrypted_secrets where name = 'maintenance_secret_key' limit 1;

  if nullif(v_project_url, '') is null or nullif(v_maintenance_key, '') is null then
    raise exception 'membership_notification_delivery_not_configured';
  end if;

  return net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/deliver-membership-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_maintenance_key
    ),
    body := jsonb_build_object('requested_at', now()),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.request_membership_notification_delivery() from public, anon, authenticated;
grant execute on function public.request_membership_notification_delivery() to service_role;

create or replace function public.dispatch_due_membership_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_email is not null
    and new.email_status = 'queued'
    and new.scheduled_for <= now() then
    begin
      perform public.request_membership_notification_delivery();
    exception when others then
      -- The durable outbox row must survive a delivery configuration or network
      -- failure. The recovery job reports the configuration error and retries.
      raise warning 'Immediate membership email dispatch could not be requested.';
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.dispatch_due_membership_notification() from public, anon, authenticated;

create or replace trigger dispatch_due_membership_notification
after insert on public.membership_notifications
for each row execute function public.dispatch_due_membership_notification();

do $$ begin
  perform cron.unschedule('deliver-membership-notifications');
exception when others then null;
end $$;

select cron.schedule(
  'deliver-membership-notifications',
  '* * * * *',
  $job$select public.request_membership_notification_delivery();$job$
);
