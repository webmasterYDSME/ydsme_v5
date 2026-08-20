-- Atomic membership workflow operations, lifecycle scheduling and the one-time
-- MemberMojo cutover bridge.

create or replace function public.activate_membership_application(
  p_application_id uuid,
  p_plan_price_id uuid,
  p_method text,
  p_amount_pence integer,
  p_actor_id uuid default null,
  p_cash_receipt_reference text default null,
  p_stripe_checkout_session_id text default null,
  p_stripe_payment_intent_id text default null,
  p_stripe_invoice_id text default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_stripe_subscription_status text default null,
  p_cancel_at_period_end boolean default false,
  p_current_period_end timestamptz default null
)
returns table(member_id uuid, term_id uuid, payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.membership_applications%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_plan public.membership_plans%rowtype;
  v_member_id uuid;
  v_term_id uuid;
  v_payment_id uuid;
  v_year integer;
  v_expected integer;
  v_now timestamptz := now();
begin
  if p_method not in ('stripe', 'cash') then raise exception 'membership_payment_method_invalid'; end if;
  if p_method = 'cash' and (
    p_actor_id is null
    or not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_cash_receipt_reference), '') is null
  ) then raise exception 'membership_cash_confirmation_invalid'; end if;
  if p_method = 'stripe' and (
    p_actor_id is not null
    or p_stripe_checkout_session_id is null
    or p_stripe_customer_id is null
    or p_stripe_subscription_id is null
  ) then raise exception 'membership_stripe_confirmation_invalid'; end if;

  select * into v_application
  from public.membership_applications
  where id = p_application_id
  for update;
  if not found then raise exception 'membership_application_not_found'; end if;
  if v_application.status = 'converted' then
    return query
      select v_application.converted_member_id, term.id, payment.id
      from public.membership_terms term
      join public.membership_payments payment on payment.term_id = term.id
      where term.application_id = v_application.id
      order by payment.created_at desc limit 1;
    return;
  end if;
  if (p_method = 'cash' and v_application.status <> 'awaiting_cash')
    or (p_method = 'stripe' and v_application.status <> 'awaiting_payment')
    or v_application.payment_method <> p_method then
    raise exception 'membership_application_not_payable';
  end if;

  select price.* into v_price
  from public.membership_plan_prices price
  where price.id = p_plan_price_id
    and price.plan_id = v_application.requested_plan_id
    and price.active;
  if not found then raise exception 'membership_price_unavailable'; end if;
  select * into v_plan from public.membership_plans where id = v_price.plan_id;

  v_year := public.membership_billing_year(v_application.created_at::date);
  v_expected := public.prorated_membership_fee_pence(v_price.amount_pence, v_application.created_at::date);
  if v_price.membership_year <> v_year or p_amount_pence <> v_expected then
    raise exception 'membership_payment_amount_invalid';
  end if;

  if exists (
    select 1 from public.members existing
    where lower(existing.contact_email) = lower(v_application.contact_email)
      and existing.effective_state <> 'archived'
  ) then raise exception 'membership_identity_already_exists'; end if;

  insert into public.members(
    title, full_name, contact_email, contact_number, date_of_birth,
    guardian_name, guardian_email, guardian_consent_at, current_plan_id,
    effective_state, joined_on, source
  ) values (
    v_application.title, v_application.full_name, lower(v_application.contact_email),
    v_application.contact_number, v_application.date_of_birth,
    v_application.guardian_name, lower(v_application.guardian_email),
    case when v_application.guardian_consent then v_application.terms_accepted_at else null end,
    v_application.requested_plan_id, 'active', current_date, 'website'
  ) returning id into v_member_id;

  insert into public.membership_terms(
    member_id, plan_price_id, membership_year, starts_on, ends_on, grace_ends_on,
    status, amount_due_pence, amount_paid_pence, source, application_id
  ) values (
    v_member_id, p_plan_price_id, v_year, make_date(v_year, 1, 1), make_date(v_year, 12, 31),
    make_date(v_year + 1, 3, 1), 'paid', p_amount_pence, p_amount_pence,
    'application', v_application.id
  ) returning id into v_term_id;

  insert into public.membership_payments(
    term_id, method, status, amount_pence, stripe_checkout_session_id,
    stripe_payment_intent_id, stripe_invoice_id, cash_receipt_reference,
    received_by, received_at
  ) values (
    v_term_id, p_method, 'paid', p_amount_pence, p_stripe_checkout_session_id,
    p_stripe_payment_intent_id, p_stripe_invoice_id,
    case when p_method = 'cash' then btrim(p_cash_receipt_reference) else null end,
    p_actor_id, case when p_method = 'cash' then v_now else null end
  ) returning id into v_payment_id;

  if p_method = 'stripe' then
    insert into public.membership_subscriptions(
      member_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      status, cancel_at_period_end, current_period_end, next_charge_at
    ) values (
      v_member_id, p_stripe_customer_id, p_stripe_subscription_id, v_price.stripe_price_id,
      coalesce(p_stripe_subscription_status, 'active'), p_cancel_at_period_end,
      p_current_period_end, case when p_cancel_at_period_end then null else p_current_period_end end
    )
    on conflict(member_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      status = excluded.status,
      cancel_at_period_end = excluded.cancel_at_period_end,
      current_period_end = excluded.current_period_end,
      next_charge_at = excluded.next_charge_at,
      updated_at = v_now;
  end if;

  update public.membership_applications
  set status = 'converted', converted_member_id = v_member_id, updated_at = v_now
  where id = v_application.id;

  insert into public.membership_notifications(
    member_id, recipient_email, kind, title, body, portal_visible, deduplication_key
  ) values (
    v_member_id, lower(v_application.contact_email), 'membership.activated',
    'Your Society membership is active',
    format('Your %s membership for %s is active. We will send your secure portal invitation separately.', v_plan.name, v_year),
    false, 'membership-activated-' || v_member_id::text || '-' || v_year::text
  );

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values (
    p_actor_id, case when p_actor_id is null then 'system' else 'committee' end,
    'membership.activated', 'member', v_member_id::text,
    format('%s membership activated by %s payment.', v_plan.name, p_method),
    jsonb_build_object('term_year', v_year, 'method', p_method, 'amount_pence', p_amount_pence)
  );

  return query select v_member_id, v_term_id, v_payment_id;
end;
$$;

create or replace function public.grant_lifetime_honorary_membership(
  p_member_id uuid,
  p_effective_from date,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_member public.members%rowtype;
  v_status text;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_reason), '') is null
    or char_length(btrim(p_reason)) < 5
    or p_effective_from < current_date then
    raise exception 'honorary_membership_grant_invalid';
  end if;
  select * into v_member from public.members where id = p_member_id for update;
  if not found or v_member.effective_state = 'archived' then raise exception 'honorary_member_unavailable'; end if;
  if exists (
    select 1 from public.honorary_memberships
    where member_id = p_member_id and status in ('scheduled', 'active')
  ) then raise exception 'honorary_membership_already_exists'; end if;

  v_status := case when p_effective_from <= current_date then 'active' else 'scheduled' end;
  insert into public.honorary_memberships(member_id, status, effective_from, reason, granted_by)
  values(p_member_id, v_status, p_effective_from, btrim(p_reason), p_actor_id)
  returning id into v_id;

  if v_status = 'active' and v_member.effective_state not in ('suspended', 'archived') then
    update public.members set effective_state = 'honorary', updated_at = now() where id = p_member_id;
    update public.users set membership_status = 'active', updated_at = now()
    where id = v_member.auth_user_id and membership_status = 'lapsed';
  end if;

  if exists (
    select 1 from public.membership_terms
    where member_id = p_member_id
      and membership_year = extract(year from p_effective_from)::integer
      and status = 'paid'
  ) then
    insert into public.membership_notifications(
      member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
    ) values (
      p_member_id, v_member.auth_user_id, v_member.contact_email, 'membership.honorary-payment-review',
      'Honorary membership needs a payment review',
      'A paid term already exists for the honorary start year. A membership officer must review it; no refund has been made automatically.',
      '/admin/memberships?queue=payment-review', 'honorary-payment-review-' || v_id::text
    );
  end if;

  insert into public.membership_notifications(
    member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
  ) values (
    p_member_id, v_member.auth_user_id, v_member.contact_email, 'membership.honorary-scheduled',
    'Lifetime honorary membership recorded',
    format('Your lifetime honorary membership will take effect on %s. No membership payment will be due after that date.', to_char(p_effective_from, 'FMDD FMMonth YYYY')),
    '/account', 'honorary-scheduled-' || v_id::text
  );

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values(p_actor_id, 'committee', 'membership.honorary-granted', 'honorary_membership', v_id::text,
    'Lifetime honorary membership granted.',
    jsonb_build_object('member_id', p_member_id, 'effective_from', p_effective_from, 'reason', btrim(p_reason)));
  return v_id;
end;
$$;

create or replace function public.revoke_lifetime_honorary_membership(
  p_honorary_id uuid,
  p_effective_on date,
  p_replacement_plan_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_honorary public.honorary_memberships%rowtype;
  v_member public.members%rowtype;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_reason), '') is null
    or char_length(btrim(p_reason)) < 5
    or p_effective_on < current_date
    or not exists (select 1 from public.membership_plans where id = p_replacement_plan_id and active) then
    raise exception 'honorary_membership_revocation_invalid';
  end if;
  select * into v_honorary from public.honorary_memberships
  where id = p_honorary_id and status in ('scheduled', 'active') for update;
  if not found then raise exception 'honorary_membership_not_found'; end if;
  select * into v_member from public.members where id = v_honorary.member_id;

  update public.honorary_memberships
  set revoked_effective_on = p_effective_on, revocation_reason = btrim(p_reason),
      replacement_plan_id = p_replacement_plan_id, revoked_by = p_actor_id,
      revoked_at = now(), updated_at = now()
  where id = p_honorary_id;

  insert into public.membership_notifications(
    member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
  ) values (
    v_member.id, v_member.auth_user_id, v_member.contact_email, 'membership.honorary-transition',
    'Your membership will change',
    format('Your honorary membership will end on %s. Please arrange payment for the replacement membership before that date.', to_char(p_effective_on, 'FMDD FMMonth YYYY')),
    '/account', 'honorary-transition-' || p_honorary_id::text || '-' || p_effective_on::text
  );

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, before_state, after_state)
  values(p_actor_id, 'committee', 'membership.honorary-revocation-scheduled', 'honorary_membership', p_honorary_id::text,
    'Honorary membership transition scheduled.',
    jsonb_build_object('status', v_honorary.status),
    jsonb_build_object('effective_on', p_effective_on, 'replacement_plan_id', p_replacement_plan_id, 'reason', btrim(p_reason)));
  return true;
end;
$$;

create or replace function public.reconcile_membership_subscription(
  p_stripe_subscription_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_stripe_price_id text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_member_id uuid;
begin
  update public.membership_subscriptions
  set status = left(p_status, 40), cancel_at_period_end = p_cancel_at_period_end,
      current_period_start = p_current_period_start, current_period_end = p_current_period_end,
      next_charge_at = case when p_cancel_at_period_end then null else p_current_period_end end,
      stripe_price_id = coalesce(p_stripe_price_id, stripe_price_id), updated_at = now()
  where stripe_subscription_id = p_stripe_subscription_id
  returning member_id into v_member_id;
  return v_member_id;
end;
$$;

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
    status = excluded.status, stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, public.membership_payments.stripe_payment_intent_id),
    stripe_charge_id = coalesce(excluded.stripe_charge_id, public.membership_payments.stripe_charge_id), updated_at = now();

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

create or replace function public.run_membership_daily(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_honorary_activated integer := 0;
  v_honorary_revoked integer := 0;
  v_grace integer := 0;
  v_lapsed integer := 0;
  v_notices integer := 0;
  v_year integer := extract(year from p_today)::integer;
begin
  with activated as (
    update public.honorary_memberships honorary
    set status = 'active', updated_at = now()
    where honorary.status = 'scheduled' and honorary.effective_from <= p_today
    returning honorary.member_id
  )
  update public.members member set effective_state = 'honorary', updated_at = now()
  from activated where member.id = activated.member_id and member.effective_state not in ('suspended','archived');
  get diagnostics v_honorary_activated = row_count;

  update public.users profile set membership_status = 'active', updated_at = now()
  from public.members member
  where member.auth_user_id = profile.id and member.effective_state = 'honorary' and profile.membership_status = 'lapsed';

  with revoked as (
    update public.honorary_memberships honorary
    set status = 'revoked', updated_at = now()
    where honorary.status in ('scheduled','active')
      and honorary.revoked_effective_on is not null
      and honorary.revoked_effective_on <= p_today
    returning honorary.member_id, honorary.replacement_plan_id, honorary.revoked_effective_on
  )
  update public.members member
  set current_plan_id = revoked.replacement_plan_id,
      effective_state = case
        when exists (
          select 1 from public.membership_terms term
          where term.member_id = member.id
            and term.membership_year = extract(year from revoked.revoked_effective_on)::integer
            and term.status = 'paid'
        ) then 'active'
        when extract(month from revoked.revoked_effective_on) = 1 and extract(day from revoked.revoked_effective_on) = 1 then 'grace'
        else 'lapsed'
      end,
      updated_at = now()
  from revoked
  where member.id = revoked.member_id and member.effective_state not in ('suspended','archived');
  get diagnostics v_honorary_revoked = row_count;

  if extract(month from p_today) = 1 and extract(day from p_today) = 1 then
    update public.members member
    set effective_state = 'grace', updated_at = now()
    where member.effective_state = 'active'
      and not exists (
        select 1 from public.honorary_memberships honorary
        where honorary.member_id = member.id and honorary.status = 'active'
      )
      and not exists (
        select 1 from public.membership_terms term
        where term.member_id = member.id and term.membership_year = v_year and term.status = 'paid'
      );
    get diagnostics v_grace = row_count;
  end if;

  if extract(month from p_today) = 3 and extract(day from p_today) = 1 then
    update public.members member
    set effective_state = 'lapsed', updated_at = now()
    where member.effective_state = 'grace'
      and not exists (
        select 1 from public.honorary_memberships honorary
        where honorary.member_id = member.id and honorary.status = 'active'
      )
      and not exists (
        select 1 from public.membership_terms term
        where term.member_id = member.id and term.membership_year = v_year and term.status = 'paid'
      );
    get diagnostics v_lapsed = row_count;

    update public.users profile set membership_status = 'lapsed', updated_at = now()
    from public.members member
    where member.auth_user_id = profile.id and member.effective_state = 'lapsed'
      and profile.membership_status = 'active';
  end if;

  if (extract(month from p_today), extract(day from p_today)) in ((12,2),(12,25),(1,1),(1,8),(1,31),(2,25)) then
    insert into public.membership_notifications(
      member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
    )
    select member.id, member.auth_user_id, member.contact_email,
      case when p_today < make_date(v_year + case when extract(month from p_today)=12 then 1 else 0 end,1,1)
        then 'membership.renewal-upcoming' else 'membership.renewal-overdue' end,
      case when p_today < make_date(v_year + case when extract(month from p_today)=12 then 1 else 0 end,1,1)
        then 'Your membership renewal is approaching' else 'Your membership renewal is overdue' end,
      case when p_today < make_date(v_year + case when extract(month from p_today)=12 then 1 else 0 end,1,1)
        then 'Review your next membership payment and auto-renewal setting in your Society account.'
        else 'Your membership is in its renewal grace period. Please renew before 1 March to retain portal access.' end,
      '/account',
      'membership-reminder-' || member.id::text || '-' || p_today::text
    from public.members member
    where member.contact_email is not null
      and member.effective_state in ('active','grace')
      and not exists (
        select 1 from public.honorary_memberships honorary
        where honorary.member_id = member.id and honorary.status in ('scheduled','active')
          and honorary.effective_from <= make_date(v_year + case when extract(month from p_today)=12 then 1 else 0 end,1,1)
      )
      and not exists (
        select 1 from public.membership_terms term
        where term.member_id = member.id
          and term.membership_year = v_year + case when extract(month from p_today)=12 then 1 else 0 end
          and term.status = 'paid'
      )
    on conflict(deduplication_key) do nothing;
    get diagnostics v_notices = row_count;
  end if;

  return jsonb_build_object(
    'honorary_activated', v_honorary_activated,
    'honorary_revoked', v_honorary_revoked,
    'grace_started', v_grace,
    'lapsed', v_lapsed,
    'notifications_queued', v_notices
  );
end;
$$;

create or replace function public.claim_membership_notifications(p_limit integer default 25)
returns table(
  notification_id uuid, recipient_email text, title text, body text,
  kind text, action_href text, email_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select notification.id
    from public.membership_notifications notification
    where notification.email_status in ('queued','failed')
      and notification.scheduled_for <= now()
      and notification.email_attempts < 5
    order by notification.scheduled_for, notification.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.membership_notifications notification
    set email_status = 'sending', email_attempts = notification.email_attempts + 1,
        last_email_error = null, updated_at = now()
    from candidates where notification.id = candidates.id
    returning notification.*
  )
  select claimed.id, claimed.recipient_email, claimed.title, claimed.body,
    claimed.kind, claimed.action_href, claimed.email_attempts
  from claimed where claimed.recipient_email is not null;
end;
$$;

create or replace function public.complete_membership_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.membership_notifications
  set email_status = case when p_sent then 'sent' else 'failed' end,
      email_sent_at = case when p_sent then now() else null end,
      last_email_error = case when p_sent then null else left(coalesce(p_error, 'Email delivery failed.'), 500) end,
      updated_at = now()
  where id = p_notification_id and email_status = 'sending';
  return found;
end;
$$;

create or replace function public.stage_membermojo_membership_cutover(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record public.membership_records%rowtype;
  v_plan_id uuid;
  v_price public.membership_plan_prices%rowtype;
  v_member_id uuid;
  v_created integer := 0;
  v_terms integer := 0;
  v_reviews integer := 0;
  v_year integer := extract(year from current_date)::integer;
  v_kind text;
begin
  if not public.has_membership_management_capability(p_actor_id) then
    raise exception 'membermojo_cutover_actor_invalid';
  end if;

  for v_record in
    select * from public.membership_records record
    where record.source = 'membermojo' and record.membership_ended_at is null
    order by record.external_id
  loop
    if exists (select 1 from public.members where legacy_membership_record_id = v_record.id) then continue; end if;
    v_kind := null;
    if lower(v_record.membership_type) ~ '(honor|life)' then
      v_kind := 'honorary_candidate';
      v_plan_id := null;
    elsif lower(v_record.membership_type) like '%junior%' then
      select id into v_plan_id from public.membership_plans where slug = 'junior';
    elsif lower(v_record.membership_type) like '%student%' then
      select id into v_plan_id from public.membership_plans where slug = 'student';
    elsif lower(v_record.membership_type) ~ '(concession|senior|over 80)' then
      select id into v_plan_id from public.membership_plans where slug = 'concession';
    elsif lower(v_record.membership_type) like '%adult%' then
      select id into v_plan_id from public.membership_plans where slug = 'adult';
    else
      v_kind := 'unknown_plan';
      v_plan_id := null;
    end if;

    insert into public.members(
      auth_user_id, title, full_name, contact_email, current_plan_id, effective_state,
      joined_on, source, legacy_external_id, legacy_membership_record_id
    ) values (
      v_record.auth_user_id, v_record.title, btrim(v_record.first_name || ' ' || v_record.last_name),
      lower(v_record.contact_email), v_plan_id, 'active', coalesce(v_record.source_member_since, current_date),
      'membermojo_cutover', v_record.external_id, v_record.id
    ) returning id into v_member_id;
    v_created := v_created + 1;

    if v_kind is not null then
      insert into public.membership_migration_reviews(membership_record_id, review_kind, summary)
      values(v_record.id, v_kind,
        case when v_kind = 'honorary_candidate'
          then 'Source membership type may be honorary or life membership and requires officer confirmation.'
          else 'Source membership type could not be mapped to a website plan.' end)
      on conflict do nothing;
      v_reviews := v_reviews + 1;
    else
      select * into v_price from public.membership_plan_prices
      where plan_id = v_plan_id and membership_year = v_year and active
      order by version desc limit 1;
      if found then
        insert into public.membership_terms(
          member_id, plan_price_id, membership_year, starts_on, ends_on, grace_ends_on,
          status, amount_due_pence, amount_paid_pence, source
        ) values (
          v_member_id, v_price.id, v_year, make_date(v_year,1,1), make_date(v_year,12,31),
          make_date(v_year+1,3,1), 'paid', v_price.amount_pence, v_price.amount_pence, 'membermojo_cutover'
        );
        v_terms := v_terms + 1;
      end if;
    end if;

    if v_record.contact_email is null then
      insert into public.membership_migration_reviews(membership_record_id, review_kind, summary)
      values(v_record.id, 'missing_email', 'No contact email is available for a portal invitation or notifications.')
      on conflict do nothing;
      v_reviews := v_reviews + 1;
    elsif (select count(*) from public.membership_records other where lower(other.contact_email) = lower(v_record.contact_email) and other.membership_ended_at is null) > 1 then
      insert into public.membership_migration_reviews(membership_record_id, review_kind, summary)
      values(v_record.id, 'shared_email', 'This email is shared by multiple active source records and requires identity review.')
      on conflict do nothing;
      v_reviews := v_reviews + 1;
    end if;
  end loop;

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values(p_actor_id, 'committee', 'membership.membermojo-cutover-staged', 'membership_cutover', gen_random_uuid()::text,
    format('Staged %s canonical members, %s current terms and %s review items.', v_created, v_terms, v_reviews),
    jsonb_build_object('members_created', v_created, 'terms_created', v_terms, 'reviews_created', v_reviews));
  return jsonb_build_object('members_created', v_created, 'terms_created', v_terms, 'reviews_created', v_reviews);
end;
$$;

revoke all on function public.activate_membership_application(uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.grant_lifetime_honorary_membership(uuid,date,text,uuid) from public, anon, authenticated;
revoke all on function public.revoke_lifetime_honorary_membership(uuid,date,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.reconcile_membership_subscription(text,text,boolean,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.reconcile_membership_invoice(text,text,text,text,integer,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.run_membership_daily(date) from public, anon, authenticated;
revoke all on function public.claim_membership_notifications(integer) from public, anon, authenticated;
revoke all on function public.complete_membership_notification(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.stage_membermojo_membership_cutover(uuid) from public, anon, authenticated;

grant execute on function public.activate_membership_application(uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz) to service_role;
grant execute on function public.grant_lifetime_honorary_membership(uuid,date,text,uuid) to service_role;
grant execute on function public.revoke_lifetime_honorary_membership(uuid,date,uuid,text,uuid) to service_role;
grant execute on function public.reconcile_membership_subscription(text,text,boolean,timestamptz,timestamptz,text) to service_role;
grant execute on function public.reconcile_membership_invoice(text,text,text,text,integer,boolean,timestamptz) to service_role;
grant execute on function public.run_membership_daily(date) to service_role;
grant execute on function public.claim_membership_notifications(integer) to service_role;
grant execute on function public.complete_membership_notification(uuid,boolean,text) to service_role;
grant execute on function public.stage_membermojo_membership_cutover(uuid) to service_role;

do $$ begin
  perform cron.unschedule('membership-daily-lifecycle');
exception when others then null;
end $$;

select cron.schedule(
  'membership-daily-lifecycle',
  '15 6 * * *',
  $job$select public.run_membership_daily(current_date);$job$
);

do $$ begin
  perform cron.unschedule('deliver-membership-notifications');
exception when others then null;
end $$;

select cron.schedule(
  'deliver-membership-notifications',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/deliver-membership-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret_key' limit 1)
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    ) as request_id
  $job$
);
