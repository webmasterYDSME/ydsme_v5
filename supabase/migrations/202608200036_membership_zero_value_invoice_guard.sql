-- A zero-value subscription invoice is not a membership payment. Stripe emits
-- these when a deferred annual subscription is created and when its future
-- Price changes without proration. Keep the immutable paid term unchanged even
-- if a caller reaches the database function without the HTTP webhook guard.

create or replace function public.reconcile_membership_invoice(
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text,
  p_amount_paid_pence integer,
  p_paid boolean,
  p_event_created_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_term_id uuid;
  v_year integer := extract(year from p_event_created_at)::integer;
begin
  select member.* into v_member
  from public.membership_subscriptions subscription
  join public.members member on member.id = subscription.member_id
  where subscription.stripe_subscription_id = p_stripe_subscription_id;
  if not found then return null; end if;
  if p_amount_paid_pence <= 0 then return v_member.id; end if;

  select price.* into v_price
  from public.membership_plan_prices price
  where price.plan_id = v_member.current_plan_id and price.membership_year = v_year and price.active
  order by price.version desc limit 1;
  if not found then return v_member.id; end if;

  insert into public.membership_terms(
    member_id, plan_price_id, membership_year, starts_on, ends_on, grace_ends_on,
    status, amount_due_pence, amount_paid_pence, source
  ) values (
    v_member.id, v_price.id, v_year, make_date(v_year,1,1), make_date(v_year,12,31), make_date(v_year+1,3,1),
    case when p_paid then 'paid' else 'grace' end,
    v_price.amount_pence, case when p_paid then least(p_amount_paid_pence, v_price.amount_pence) else 0 end, 'renewal'
  ) on conflict(member_id, membership_year) do update set
    status = case when p_paid then 'paid' else public.membership_terms.status end,
    amount_paid_pence = case when p_paid then least(p_amount_paid_pence, public.membership_terms.amount_due_pence) else public.membership_terms.amount_paid_pence end,
    updated_at = now()
  returning id into v_term_id;

  insert into public.membership_payments(
    term_id, method, status, amount_pence, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id
  ) values (
    v_term_id, 'stripe', case when p_paid then 'paid' else 'failed' end,
    greatest(p_amount_paid_pence, 1), p_stripe_invoice_id, p_stripe_payment_intent_id, p_stripe_charge_id
  ) on conflict(stripe_invoice_id) do update set
    status = excluded.status,
    stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, public.membership_payments.stripe_payment_intent_id),
    stripe_charge_id = coalesce(excluded.stripe_charge_id, public.membership_payments.stripe_charge_id),
    updated_at = now();

  if p_paid and v_member.effective_state not in ('honorary','suspended','archived') then
    update public.members set effective_state = 'active', updated_at = now() where id = v_member.id;
    update public.users set membership_status = 'active', updated_at = now()
      where id = v_member.auth_user_id and membership_status = 'lapsed';
  elsif not p_paid and v_member.effective_state = 'active' then
    update public.members set effective_state = 'grace', updated_at = now() where id = v_member.id;
  end if;
  return v_member.id;
end;
$$;
