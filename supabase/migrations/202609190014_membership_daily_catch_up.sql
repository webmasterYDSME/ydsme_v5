-- The daily membership job moves members to grace on exactly 1 January and to lapsed on exactly
-- 1 March, and only looks at the date it is given. If it was down or failed on one of those days,
-- nobody moved until the following year. The job now remembers each day it has completed and, when
-- it next runs, also runs every day it missed (up to 60), oldest first, so a missed day catches up.

create table if not exists public.membership_daily_runs (
  run_date date primary key,
  completed_at timestamptz not null default now(),
  result jsonb
);
alter table public.membership_daily_runs enable row level security;
revoke all on table public.membership_daily_runs from public, anon, authenticated;

create or replace function public.run_membership_daily_catch_up(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last date;
  v_from date;
  v_day date;
  v_result jsonb;
  v_days integer := 0;
begin
  select max(run_date) into v_last from public.membership_daily_runs;
  -- With no history, only today is run: nothing is replayed from before the job started.
  v_from := case when v_last is null then p_today
    else least(p_today, greatest(v_last + 1, p_today - 60)) end;
  for v_day in select generate_series(v_from, p_today, interval '1 day')::date loop
    v_result := public.run_membership_daily(v_day);
    insert into public.membership_daily_runs(run_date, result) values (v_day, v_result)
    on conflict (run_date) do update set completed_at = now(), result = excluded.result;
    v_days := v_days + 1;
  end loop;
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('days_run', v_days);
end;
$$;

revoke all on function public.run_membership_daily_catch_up(date) from public, anon, authenticated;
grant execute on function public.run_membership_daily_catch_up(date) to service_role;
