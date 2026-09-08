-- Preserve the latest applicable fee fallback without bypassing caller RLS.
-- The view orders by version; only that additional public metadata is needed.
grant select (version) on public.membership_plan_prices to anon, authenticated;

alter policy ydsme_membership_plan_prices_public_read
on public.membership_plan_prices
using (
  active
  and membership_year <= public.membership_billing_year(current_date)
  and exists (
    select 1 from public.membership_plans plan
    where plan.id = membership_plan_prices.plan_id and plan.active
  )
);

alter view public.public_membership_plans set (security_invoker = true);
