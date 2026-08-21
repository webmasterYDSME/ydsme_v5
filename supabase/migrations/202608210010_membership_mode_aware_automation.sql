-- Route financial lifecycle automation through an Edge Function that can read
-- MEMBERSHIP_MODE. Drain mode retains recovery commands and retention while
-- pausing applications, reminders, transition application, grace and lapse.

do $$
declare v_job text;
begin
  foreach v_job in array array[
    'membership-daily-lifecycle','expire-membership-applications','roll-forward-membership-prices',
    'prepare-membership-age-transitions','membership-launch-retention','membership-provider-commands'
  ] loop
    begin perform cron.unschedule(v_job); exception when others then null; end;
  end loop;
end $$;

create or replace function public.request_membership_automation(p_job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_project_url text; v_key text;
begin
  if p_job not in ('lifecycle','commands') then raise exception 'membership_automation_job_invalid'; end if;
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='maintenance_secret_key' limit 1;
  if nullif(v_project_url,'') is null or nullif(v_key,'') is null then
    raise exception 'membership_automation_not_configured';
  end if;
  return net.http_post(
    url:=rtrim(v_project_url,'/')||'/functions/v1/run-membership-automation',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:=jsonb_build_object('job',p_job,'requested_at',now()),timeout_milliseconds:=30000
  );
end;
$$;

revoke all on function public.request_membership_automation(text) from public,anon,authenticated;
grant execute on function public.request_membership_automation(text) to service_role;

select cron.schedule('membership-daily-lifecycle','15 6 * * *',$job$select public.request_membership_automation('lifecycle');$job$);
select cron.schedule('membership-provider-commands','*/5 * * * *',$job$select public.request_membership_automation('commands');$job$);
