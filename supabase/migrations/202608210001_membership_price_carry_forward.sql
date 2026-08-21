-- Annual membership fees remain in force until an officer replaces them.
-- A year-specific database snapshot is created automatically for financial
-- history, while the immutable Stripe Price can be reused when the amount has
-- not changed.

alter table public.membership_plan_prices
  drop constraint if exists membership_plan_prices_stripe_price_id_key;

create index if not exists membership_plan_prices_stripe_price_idx
  on public.membership_plan_prices(stripe_price_id)
  where stripe_price_id is not null;

alter table public.membership_plan_prices
  add column if not exists carried_forward_from_id uuid
    references public.membership_plan_prices(id) on delete restrict;

create or replace function public.ensure_membership_plan_price(
  p_plan_id uuid,
  p_membership_year integer
)
returns table(
  id uuid,
  plan_id uuid,
  membership_year integer,
  version integer,
  amount_pence integer,
  currency text,
  stripe_price_id text,
  active boolean,
  carried_forward_from_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price public.membership_plan_prices%rowtype;
  v_version integer;
begin
  if p_plan_id is null or p_membership_year not between 2020 and 2200 then
    raise exception 'membership_price_year_invalid';
  end if;

  select price.* into v_price
  from public.membership_plan_prices price
  where price.plan_id = p_plan_id
    and price.membership_year = p_membership_year
    and price.active
  order by price.version desc
  limit 1;

  if not found then
    select price.* into v_price
    from public.membership_plan_prices price
    where price.plan_id = p_plan_id
      and price.membership_year < p_membership_year
      and price.active
    order by price.membership_year desc, price.version desc
    limit 1;

    if not found then raise exception 'membership_price_unavailable'; end if;

    select coalesce(max(price.version), 0) + 1 into v_version
    from public.membership_plan_prices price
    where price.plan_id = p_plan_id
      and price.membership_year = p_membership_year;

    begin
      insert into public.membership_plan_prices(
        plan_id, membership_year, version, amount_pence, currency,
        stripe_price_id, active, carried_forward_from_id
      ) values (
        p_plan_id, p_membership_year, v_version, v_price.amount_pence,
        v_price.currency, v_price.stripe_price_id, true, v_price.id
      )
      returning * into v_price;
    exception when unique_violation then
      select price.* into v_price
      from public.membership_plan_prices price
      where price.plan_id = p_plan_id
        and price.membership_year = p_membership_year
        and price.active
      order by price.version desc
      limit 1;
      if not found then raise; end if;
    end;
  end if;

  return query select
    v_price.id,
    v_price.plan_id,
    v_price.membership_year,
    v_price.version,
    v_price.amount_pence,
    v_price.currency,
    v_price.stripe_price_id,
    v_price.active,
    v_price.carried_forward_from_id;
end;
$$;

revoke all on function public.ensure_membership_plan_price(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ensure_membership_plan_price(uuid, integer)
  to service_role;

create or replace function public.roll_forward_membership_plan_prices(
  p_membership_year integer default public.membership_billing_year(current_date)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_count integer := 0;
begin
  if p_membership_year not between 2020 and 2200 then
    raise exception 'membership_price_year_invalid';
  end if;
  for v_plan in select id from public.membership_plans where active loop
    perform public.ensure_membership_plan_price(v_plan.id, p_membership_year);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.roll_forward_membership_plan_prices(integer)
  from public, anon, authenticated;
grant execute on function public.roll_forward_membership_plan_prices(integer)
  to service_role;

create or replace view public.public_membership_plans
with (security_invoker = false)
as
select
  plan.id,
  plan.slug,
  plan.name,
  plan.description,
  plan.minimum_age,
  plan.maximum_age,
  plan.requires_approval,
  public.membership_billing_year(current_date) as membership_year,
  price.amount_pence,
  price.currency
from public.membership_plans plan
join lateral (
  select candidate.amount_pence, candidate.currency
  from public.membership_plan_prices candidate
  where candidate.plan_id = plan.id
    and candidate.active
    and candidate.membership_year <= public.membership_billing_year(current_date)
  order by candidate.membership_year desc, candidate.version desc
  limit 1
) price on true
where plan.active;

revoke all on public.public_membership_plans from public;
grant select on public.public_membership_plans to anon, authenticated, service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'roll-forward-membership-prices';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'roll-forward-membership-prices',
    '5 0 1 1,12 *',
    'select public.roll_forward_membership_plan_prices(public.membership_billing_year(current_date))'
  );
end $$;
