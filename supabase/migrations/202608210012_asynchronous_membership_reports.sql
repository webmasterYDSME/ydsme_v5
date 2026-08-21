insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('membership-reports','membership-reports',false,52428800,array['application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.claim_membership_report_export()
returns table(export_id uuid,filters jsonb)
language plpgsql
security definer
set search_path=''
as $$
begin
  return query
  with candidate as (
    select report.id from public.membership_report_exports report
    where report.status='queued'
      or (report.status='processing' and report.created_at<now()-interval '20 minutes')
    order by report.created_at
    for update skip locked limit 1
  ), claimed as (
    update public.membership_report_exports report
    set status='processing',last_error=null
    from candidate where report.id=candidate.id
    returning report.id,report.filters
  ) select claimed.id,claimed.filters from claimed;
end;
$$;

create or replace function public.request_membership_report_generation()
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_url text;v_key text;v_request bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='maintenance_secret_key' limit 1;
  if v_url is null or v_key is null then raise exception 'membership_report_generation_not_configured'; end if;
  select net.http_post(
    url:=v_url||'/functions/v1/generate-membership-report',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{}'::jsonb,timeout_milliseconds:=5000
  ) into v_request;
  return v_request is not null;
end;
$$;

revoke all on function public.claim_membership_report_export(),public.request_membership_report_generation()
  from public,anon,authenticated;
grant execute on function public.claim_membership_report_export(),public.request_membership_report_generation()
  to service_role;

do $$ declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='generate-membership-reports';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('generate-membership-reports','*/2 * * * *','select public.request_membership_report_generation();');
end $$;
