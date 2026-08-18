-- Process a large annual expiry wave within hours while keeping each Auth API
-- invocation bounded to 25 accounts.

select cron.unschedule('purge-expired-portal-accounts');

select cron.schedule(
  'purge-expired-portal-accounts',
  '47 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/purge-expired-members',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret_key' limit 1)
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    ) as request_id
  $job$
);
