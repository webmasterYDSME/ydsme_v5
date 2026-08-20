-- Full-payment renewals for existing members. Cash and Stripe share one atomic
-- write boundary; cash is officer-confirmed and Stripe is webhook-confirmed.

create or replace function public.activate_membership_renewal(
  p_member_id uuid,
  p_plan_price_id uuid,
  p_membership_year integer,
  p_method text,
  p_amount_pence integer,
  p_paid_on date,
  p_actor_id uuid default null,
  p_cash_receipt_reference text default null,
  p_stripe_checkout_session_id text default null,
  p_stripe_payment_intent_id text default null,
  p_stripe_invoice_id text default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_stripe_subscription_status text default null,
  p_cancel_at_period_end boolean default false,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_stripe_event_created_at timestamptz default null
)
returns table(member_id uuid, term_id uuid, payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_term_id uuid;
  v_payment_id uuid;
  v_expected integer;
  v_current_year integer := extract(year from p_paid_on)::integer;
begin
  if p_method not in ('stripe','cash') then raise exception 'membership_renewal_method_invalid'; end if;
  if p_method = 'cash' and (
    p_actor_id is null or not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_cash_receipt_reference), '') is null
  ) then raise exception 'membership_cash_confirmation_invalid'; end if;
  if p_method = 'stripe' and (
    p_actor_id is not null or p_stripe_checkout_session_id is null
    or p_stripe_customer_id is null or p_stripe_subscription_id is null
  ) then raise exception 'membership_stripe_confirmation_invalid'; end if;

  select * into v_member from public.members where id = p_member_id for update;
  if not found or v_member.effective_state in ('suspended','archived','honorary') then
    raise exception 'membership_renewal_member_unavailable';
  end if;
  select * into v_price from public.membership_plan_prices
  where id = p_plan_price_id and plan_id = v_member.current_plan_id
    and membership_year = p_membership_year and active;
  if not found then raise exception 'membership_renewal_price_unavailable'; end if;
  if p_membership_year < v_current_year or p_membership_year > v_current_year + 1 then
    raise exception 'membership_renewal_year_invalid';
  end if;
  v_expected := case when p_membership_year > v_current_year
    then v_price.amount_pence
    else public.prorated_membership_fee_pence(v_price.amount_pence, p_paid_on) end;
  if p_amount_pence <> v_expected then raise exception 'membership_renewal_amount_invalid'; end if;

  insert into public.membership_terms(
    member_id, plan_price_id, membership_year, starts_on, ends_on, grace_ends_on,
    status, amount_due_pence, amount_paid_pence, source
  ) values (
    p_member_id, p_plan_price_id, p_membership_year, make_date(p_membership_year,1,1),
    make_date(p_membership_year,12,31), make_date(p_membership_year+1,3,1),
    'paid', p_amount_pence, p_amount_pence, 'renewal'
  )
  on conflict on constraint membership_terms_member_id_membership_year_key do update set
    plan_price_id = excluded.plan_price_id, status = 'paid',
    amount_due_pence = excluded.amount_due_pence, amount_paid_pence = excluded.amount_paid_pence,
    source = 'renewal', updated_at = now()
  where public.membership_terms.status in ('scheduled','grace','lapsed')
    and public.membership_terms.amount_paid_pence = 0
  returning id into v_term_id;
  if v_term_id is null then raise exception 'membership_renewal_already_paid'; end if;

  insert into public.membership_payments(
    term_id, method, status, amount_pence, stripe_checkout_session_id,
    stripe_payment_intent_id, stripe_invoice_id, cash_receipt_reference,
    received_by, received_at
  ) values (
    v_term_id, p_method, 'paid', p_amount_pence, p_stripe_checkout_session_id,
    p_stripe_payment_intent_id, p_stripe_invoice_id,
    case when p_method='cash' then btrim(p_cash_receipt_reference) else null end,
    p_actor_id, case when p_method='cash' then now() else null end
  ) returning id into v_payment_id;

  if p_method = 'stripe' then
    insert into public.membership_subscriptions(
      member_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
      cancel_at_period_end, current_period_start, current_period_end, next_charge_at,
      stripe_event_created_at
    ) values (
      p_member_id, p_stripe_customer_id, p_stripe_subscription_id, v_price.stripe_price_id,
      coalesce(p_stripe_subscription_status,'active'), p_cancel_at_period_end,
      p_current_period_start, p_current_period_end,
      case when p_cancel_at_period_end then null else p_current_period_end end,
      p_stripe_event_created_at
    ) on conflict on constraint membership_subscriptions_member_id_key do update set
      stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id,
      stripe_price_id=excluded.stripe_price_id, status=excluded.status,
      cancel_at_period_end=excluded.cancel_at_period_end,
      current_period_start=excluded.current_period_start,
      current_period_end=excluded.current_period_end,
      next_charge_at=excluded.next_charge_at,
      stripe_event_created_at=excluded.stripe_event_created_at,
      updated_at=now();
  else
    update public.membership_subscriptions
    set cancel_at_period_end=true, next_charge_at=null, updated_at=now()
    where public.membership_subscriptions.member_id=p_member_id;
  end if;

  if v_member.effective_state not in ('suspended','archived') then
    update public.members set effective_state='active', updated_at=now() where id=p_member_id;
    update public.users set membership_status='active', updated_at=now()
      where id=v_member.auth_user_id and membership_status='lapsed';
  end if;

  update public.membership_notifications set email_status='cancelled', updated_at=now()
  where public.membership_notifications.member_id=p_member_id
    and public.membership_notifications.email_status in ('queued','failed')
    and public.membership_notifications.kind in ('membership.renewal-upcoming','membership.renewal-overdue');
  insert into public.membership_notifications(
    member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
  ) values (
    p_member_id, v_member.auth_user_id, v_member.contact_email, 'membership.renewal-paid',
    'Your membership renewal is paid',
    format('Your %s membership term is active. Payment of £%s was received by %s.',
      p_membership_year, trim(to_char(p_amount_pence / 100.0, 'FM999999990.00')), p_method),
    '/account', 'membership-renewal-paid-' || v_payment_id::text
  );
  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values(p_actor_id, case when p_actor_id is null then 'system' else 'committee' end,
    'membership.renewal-paid', 'membership_term', v_term_id::text,
    'Membership renewal paid in full.',
    jsonb_build_object('member_id',p_member_id,'year',p_membership_year,'method',p_method,'amount_pence',p_amount_pence));
  return query select p_member_id, v_term_id, v_payment_id;
end;
$$;

revoke all on function public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz) to service_role;
