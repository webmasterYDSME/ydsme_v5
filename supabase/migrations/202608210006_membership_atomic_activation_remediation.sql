-- Make verified activation payment-date authoritative and safe for shared
-- correspondence addresses. A second provider payment is quarantined rather
-- than granting or overwriting another entitlement.

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
  v_today date := (now() at time zone 'Europe/London')::date;
  v_possible_duplicate uuid;
begin
  if p_method not in ('stripe','cash') then raise exception 'membership_payment_method_invalid'; end if;
  if p_method='cash' and (
    p_actor_id is null or not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_cash_receipt_reference),'') is null
  ) then raise exception 'membership_cash_confirmation_invalid'; end if;
  if p_method='stripe' and (
    p_actor_id is not null or p_stripe_checkout_session_id is null
    or p_stripe_customer_id is null or p_stripe_subscription_id is null
  ) then raise exception 'membership_stripe_confirmation_invalid'; end if;

  select * into v_application from public.membership_applications
  where id=p_application_id for update;
  if not found then raise exception 'membership_application_not_found'; end if;

  if v_application.status='converted' then
    select term.id,payment.id into v_term_id,v_payment_id
    from public.membership_terms term
    join public.membership_payments payment on payment.term_id=term.id
    where term.application_id=v_application.id
    order by payment.created_at desc limit 1;
    if p_stripe_checkout_session_id is not null and not exists(
      select 1 from public.membership_payments payment
      where payment.stripe_checkout_session_id=p_stripe_checkout_session_id
    ) then
      update public.membership_checkout_attempts set status='payment_review',
        stripe_subscription_id=coalesce(stripe_subscription_id,p_stripe_subscription_id),
        stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_stripe_payment_intent_id),
        last_error='A second successful payment was received for an already converted application.',updated_at=now()
      where stripe_checkout_session_id=p_stripe_checkout_session_id;
      insert into public.membership_notifications(
        member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
      ) select v_application.converted_member_id,officer.user_id,'membership.duplicate-payment-officer',
        'Possible duplicate membership payment',
        format('A second online payment was received for %s. Review the provider payment and do not create another entitlement.',v_application.full_name),
        '/admin/memberships?section=online-payment-problems#online-payment-problems','cancelled',
        'membership-duplicate-payment-'||p_stripe_checkout_session_id||'-'||officer.user_id::text
      from (
        select role.user_id from public.user_roles role where role.role='administrator'
        union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
      ) officer on conflict(deduplication_key) do nothing;
    end if;
    return query select v_application.converted_member_id,v_term_id,v_payment_id;
    return;
  end if;

  if (p_method='cash' and v_application.status<>'awaiting_cash')
    or (p_method='stripe' and v_application.status<>'awaiting_payment')
    or v_application.payment_method<>p_method then
    raise exception 'membership_application_not_payable';
  end if;

  select price.* into v_price from public.membership_plan_prices price
  where price.id=p_plan_price_id and price.plan_id=v_application.requested_plan_id and price.active;
  if not found then raise exception 'membership_price_unavailable'; end if;
  select * into v_plan from public.membership_plans where id=v_price.plan_id and active;
  if not found then raise exception 'membership_plan_unavailable'; end if;

  v_year:=public.membership_billing_year(v_today);
  v_expected:=public.prorated_membership_fee_pence(v_price.amount_pence,v_today);
  if v_price.membership_year<>v_year or p_amount_pence<>v_expected then
    raise exception 'membership_payment_amount_invalid';
  end if;

  select existing.id into v_possible_duplicate from public.members existing
  where existing.effective_state<>'archived'
    and lower(existing.full_name)=lower(v_application.full_name)
    and existing.date_of_birth=v_application.date_of_birth
    and existing.contact_email is not distinct from v_application.contact_email
  order by existing.created_at limit 1;

  insert into public.members(
    title,full_name,contact_email,contact_email_verified_at,contact_role,portal_invitation_status,
    newsletter_opt_in,contact_number,date_of_birth,guardian_name,guardian_email,guardian_consent_at,
    current_plan_id,effective_state,joined_on,source
  ) values (
    v_application.title,v_application.full_name,lower(v_application.contact_email),
    coalesce(v_application.email_verified_at,v_now),v_application.contact_role,
    case when v_application.guardian_led then 'not_requested' else v_application.portal_invitation_status end,
    v_application.newsletter_opt_in,v_application.contact_number,v_application.date_of_birth,
    v_application.guardian_name,lower(v_application.guardian_email),
    case when v_application.guardian_verified_at is not null then v_application.guardian_verified_at else null end,
    v_application.requested_plan_id,'active',v_today,'website'
  ) returning id into v_member_id;

  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,
    status,amount_due_pence,amount_paid_pence,source,application_id
  ) values (
    v_member_id,p_plan_price_id,v_year,v_today,make_date(v_year,12,31),
    make_date(v_year+1,3,1),'paid',p_amount_pence,p_amount_pence,'application',v_application.id
  ) returning id into v_term_id;

  insert into public.membership_payments(
    term_id,method,status,amount_pence,stripe_checkout_session_id,stripe_payment_intent_id,
    stripe_invoice_id,cash_receipt_reference,received_by,received_at
  ) values (
    v_term_id,p_method,'paid',p_amount_pence,p_stripe_checkout_session_id,p_stripe_payment_intent_id,
    p_stripe_invoice_id,case when p_method='cash' then btrim(p_cash_receipt_reference) else null end,
    p_actor_id,case when p_method='cash' then v_now else null end
  ) returning id into v_payment_id;

  if p_method='stripe' then
    insert into public.membership_subscriptions(
      member_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,
      cancel_at_period_end,current_period_end,next_charge_at
    ) values (
      v_member_id,p_stripe_customer_id,p_stripe_subscription_id,v_price.stripe_price_id,
      coalesce(p_stripe_subscription_status,'active'),p_cancel_at_period_end,p_current_period_end,
      case when p_cancel_at_period_end then null else p_current_period_end end
    ) on conflict on constraint membership_subscriptions_member_id_key do update set
      stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      stripe_price_id=excluded.stripe_price_id,status=excluded.status,
      cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,
      next_charge_at=excluded.next_charge_at,updated_at=v_now;
    if p_cancel_at_period_end then
      insert into public.membership_provider_commands(
        member_id,checkout_attempt_id,command_type,stripe_subscription_id,payload,idempotency_key
      ) select v_member_id,attempt.id,'cancel_at_boundary',p_stripe_subscription_id,
        jsonb_build_object('cancel_at_period_end',true),
        'checkout-cancel-at-boundary-'||p_stripe_checkout_session_id
      from public.membership_checkout_attempts attempt
      where attempt.stripe_checkout_session_id=p_stripe_checkout_session_id
      on conflict(idempotency_key) do nothing;
    end if;
  end if;

  update public.membership_applications set status='converted',converted_member_id=v_member_id,updated_at=v_now
  where id=v_application.id;
  update public.membership_checkout_attempts set status='complete',completed_at=v_now,
    stripe_subscription_id=coalesce(stripe_subscription_id,p_stripe_subscription_id),
    stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_stripe_payment_intent_id),updated_at=v_now
  where stripe_checkout_session_id=p_stripe_checkout_session_id;

  insert into public.membership_notifications(
    member_id,recipient_email,kind,title,body,portal_visible,deduplication_key
  ) values (
    v_member_id,lower(v_application.contact_email),'membership.activated',
    format('%s''s Society membership is active',v_application.full_name),
    format('%s''s %s membership for %s is active. Payment of £%s has been confirmed.',
      v_application.full_name,v_plan.name,v_year,trim(to_char(p_amount_pence/100.0,'FM999999990.00'))),
    not v_application.guardian_led,'membership-activated-'||v_member_id::text||'-'||v_year::text
  );

  if v_possible_duplicate is not null then
    insert into public.membership_notifications(
      member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
    ) select v_member_id,officer.user_id,'membership.possible-duplicate-officer',
      'Possible duplicate member needs review',
      format('%s has the same name, date of birth and contact email as another member. Both records remain separate until reviewed.',v_application.full_name),
      '/admin/memberships?section=applications#applications','cancelled',
      'membership-possible-duplicate-'||v_member_id::text||'-'||officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role='administrator'
      union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
    ) officer on conflict(deduplication_key) do nothing;
  end if;

  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,case when p_actor_id is null then 'system' else 'committee' end,
    'membership.activated','member',v_member_id::text,
    format('%s membership activated by %s payment.',v_plan.name,p_method),
    jsonb_build_object('term_year',v_year,'method',p_method,'amount_pence',p_amount_pence,
      'possible_duplicate_member_id',v_possible_duplicate,'contact_role',v_application.contact_role));
  return query select v_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.activate_membership_application(
  uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz
) from public,anon,authenticated;
grant execute on function public.activate_membership_application(
  uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz
) to service_role;

-- A partial refund also leaves the term underpaid and therefore needs an
-- officer decision. Closed/won disputes pass p_disputed=false and can restore
-- the paid state when no refund remains.
create or replace function public.mark_membership_payment_reversal(
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text,
  p_refunded_pence integer,
  p_disputed boolean,
  p_stripe_event_id text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.membership_payments%rowtype;
  v_term public.membership_terms%rowtype;
  v_member public.members%rowtype;
  v_requires_review boolean;
  v_status text;
begin
  select payment.* into v_payment from public.membership_payments payment
  where (p_stripe_payment_intent_id is not null and payment.stripe_payment_intent_id=p_stripe_payment_intent_id)
     or (p_stripe_charge_id is not null and payment.stripe_charge_id=p_stripe_charge_id)
  order by payment.created_at desc limit 1 for update;
  if not found then return null; end if;

  if p_disputed then v_status:='disputed';
  elsif greatest(coalesce(p_refunded_pence,0),0)>=v_payment.amount_pence then v_status:='refunded';
  elsif coalesce(p_refunded_pence,0)>0 then v_status:='partially_refunded';
  else v_status:='paid'; end if;
  v_requires_review:=p_disputed or v_status in ('refunded','partially_refunded');

  update public.membership_payments set status=v_status,
    refunded_pence=least(greatest(coalesce(p_refunded_pence,refunded_pence),0),amount_pence),
    stripe_charge_id=coalesce(stripe_charge_id,p_stripe_charge_id),
    notes=case when v_requires_review then 'Verified payment reversal; officer review required.' else notes end,
    updated_at=now() where id=v_payment.id;
  select * into v_term from public.membership_terms where id=v_payment.term_id for update;
  select * into v_member from public.members where id=v_term.member_id for update;

  if v_requires_review then
    update public.membership_terms set status='payment_review',updated_at=now() where id=v_term.id;
    if v_member.effective_state not in ('honorary','suspended','archived') then
      update public.members set effective_state='payment_review',updated_at=now() where id=v_member.id;
    end if;
  elsif v_term.status='payment_review' then
    update public.membership_terms set status='paid',updated_at=now() where id=v_term.id;
    if v_member.effective_state='payment_review' then
      update public.members set effective_state='active',updated_at=now() where id=v_member.id;
    end if;
  end if;

  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    v_member.id,v_member.auth_user_id,v_member.contact_email,
    case when p_disputed then 'membership.payment-disputed' when v_requires_review then 'membership.payment-refunded' else 'membership.payment-restored' end,
    case when p_disputed then 'Your membership payment is under review' when v_requires_review then 'Your membership payment changed' else 'Your membership payment review is resolved' end,
    case when v_requires_review then 'Your paid term is temporarily under review. Access is retained while a membership officer resolves it.' else 'The payment provider confirmed that the payment is no longer disputed.' end,
    case when v_member.auth_user_id is null then null else '/account' end,
    'membership-reversal-member-'||p_stripe_event_id
  ) on conflict(deduplication_key) do nothing;

  if v_requires_review then
    insert into public.membership_notifications(
      member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
    ) select v_member.id,officer.user_id,'membership.payment-review-officer','Membership payment needs review',
      'A dispute or refund has left a membership term needing a decision.',
      '/admin/memberships?section=payment-reviews#payment-reviews','cancelled',
      'membership-reversal-officer-'||p_stripe_event_id||'-'||officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role='administrator'
      union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
    ) officer on conflict(deduplication_key) do nothing;
  end if;

  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(null,'system','membership.payment-reversal','membership_payment',v_payment.id::text,
    'Verified payment reversal state recorded.',jsonb_build_object('stripe_event_id',p_stripe_event_id,
      'status',v_status,'refunded_pence',greatest(coalesce(p_refunded_pence,0),0),'payment_review',v_requires_review));
  return v_member.id;
end;
$$;
