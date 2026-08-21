-- Financial and shared-contact launch guards. Payment dates, rather than the
-- application submission date, determine initial proration. Renewal payments
-- are always the complete annual fee.

create or replace function public.record_offline_application_payment(
  p_application_id uuid,
  p_event text,
  p_payment_reference text,
  p_received_on date,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.membership_applications%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_record public.membership_offline_payment_records%rowtype;
  v_expected integer;
  v_actor uuid;
  v_today date := (pg_catalog.now() at time zone 'Europe/London')::date;
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'membership_offline_record_forbidden'; end if;
  if p_event not in ('received','failed') then raise exception 'membership_offline_event_invalid'; end if;
  select * into v_application from public.membership_applications where id=p_application_id for update;
  if not found or v_application.payment_method not in ('cash','bank_transfer','cheque')
    or v_application.status <> (case v_application.payment_method
      when 'cash' then 'awaiting_cash' when 'bank_transfer' then 'awaiting_bank_transfer' else 'awaiting_cheque' end)
  then raise exception 'membership_offline_application_unavailable'; end if;
  if p_event='received' and (nullif(pg_catalog.btrim(p_payment_reference),'') is null
    or p_received_on is null or p_received_on>v_today) then
    raise exception 'membership_offline_evidence_required';
  end if;
  if p_event='failed' and char_length(coalesce(pg_catalog.btrim(p_reason),''))<5 then
    raise exception 'membership_offline_failure_reason_required';
  end if;
  select * into v_price from public.membership_plan_prices
    where plan_id=v_application.requested_plan_id
      and membership_year=public.membership_billing_year(coalesce(p_received_on,v_today)) and active
    order by version desc limit 1;
  if not found then raise exception 'membership_price_unavailable'; end if;
  v_expected := public.prorated_membership_fee_pence(v_price.amount_pence,coalesce(p_received_on,v_today));
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select * into v_record from public.membership_offline_payment_records
    where application_id=p_application_id and status in ('awaiting','received') for update;
  if found then
    update public.membership_offline_payment_records set
      status=p_event,expected_amount_pence=v_expected,
      payment_reference=case when p_event='received' then pg_catalog.btrim(p_payment_reference) else payment_reference end,
      received_on=case when p_event='received' then p_received_on else received_on end,
      failure_reason=case when p_event='failed' then pg_catalog.btrim(p_reason) else null end,
      recorded_by_actor_id=v_actor,updated_at=now()
    where id=v_record.id returning id into v_record.id;
  else
    insert into public.membership_offline_payment_records(
      application_id,method,status,expected_amount_pence,payment_reference,received_on,failure_reason,
      settings_version_id,recorded_by_actor_id
    ) values (
      p_application_id,v_application.payment_method,p_event,v_expected,
      case when p_event='received' then pg_catalog.btrim(p_payment_reference) else null end,
      case when p_event='received' then p_received_on else null end,
      case when p_event='failed' then pg_catalog.btrim(p_reason) else null end,
      v_application.payment_settings_version_id,v_actor
    ) returning id into v_record.id;
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.offline-payment-'||p_event,'membership_application',p_application_id::text,
    'Offline membership payment reconciliation updated.',jsonb_build_object(
      'method',v_application.payment_method,'event',p_event,'expected_amount_pence',v_expected));
  return v_record.id;
end;
$$;

revoke all on function public.record_offline_application_payment(uuid,text,text,date,text,uuid) from public,anon,authenticated;
grant execute on function public.record_offline_application_payment(uuid,text,text,date,text,uuid) to service_role;

create or replace function public.activate_offline_membership_application(
  p_application_id uuid,
  p_plan_price_id uuid,
  p_amount_pence integer,
  p_payment_reference text,
  p_received_on date,
  p_actor_id uuid
)
returns table(member_id uuid,term_id uuid,payment_id uuid)
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
  v_actor uuid;
  v_today date := (pg_catalog.now() at time zone 'Europe/London')::date;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or nullif(pg_catalog.btrim(p_payment_reference),'') is null
    or p_received_on is null or p_received_on > v_today then
    raise exception 'membership_offline_confirmation_invalid';
  end if;
  select * into v_application from public.membership_applications where id=p_application_id for update;
  if not found then raise exception 'membership_application_not_found'; end if;
  if v_application.status='converted' then
    return query select v_application.converted_member_id,t.id,p.id from public.membership_terms t
      join public.membership_payments p on p.term_id=t.id where t.application_id=v_application.id
      order by p.created_at desc limit 1;
    return;
  end if;
  if v_application.payment_method not in ('cash','bank_transfer','cheque')
    or v_application.status <> (case v_application.payment_method
      when 'cash' then 'awaiting_cash' when 'bank_transfer' then 'awaiting_bank_transfer' else 'awaiting_cheque' end)
  then raise exception 'membership_application_not_payable'; end if;
  if v_application.guardian_email is not null and v_application.guardian_verified_at is null then
    raise exception 'membership_guardian_not_verified';
  end if;
  v_year := public.membership_billing_year(p_received_on);
  select * into v_price from public.membership_plan_prices where id=p_plan_price_id
    and plan_id=v_application.requested_plan_id and membership_year=v_year and active;
  if not found then raise exception 'membership_price_unavailable'; end if;
  select * into v_plan from public.membership_plans where id=v_price.plan_id and active;
  if not found then raise exception 'membership_plan_unavailable'; end if;
  v_expected := public.prorated_membership_fee_pence(v_price.amount_pence,p_received_on);
  if p_amount_pence<>v_expected then raise exception 'membership_payment_amount_invalid'; end if;
  if exists(select 1 from public.members m where m.effective_state<>'archived'
    and lower(m.full_name)=lower(v_application.full_name) and m.date_of_birth=v_application.date_of_birth) then
    raise exception 'membership_possible_duplicate';
  end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  insert into public.members(
    title,full_name,contact_email,contact_email_verified_at,contact_role,portal_invitation_status,
    newsletter_opt_in,contact_number,date_of_birth,guardian_name,guardian_email,
    guardian_consent_at,current_plan_id,effective_state,joined_on,source
  ) values (
    v_application.title,v_application.full_name,lower(v_application.contact_email),
    coalesce(v_application.email_verified_at,now()),v_application.contact_role,
    case when v_application.guardian_led then 'not_requested' else v_application.portal_invitation_status end,
    v_application.newsletter_opt_in,v_application.contact_number,v_application.date_of_birth,
    v_application.guardian_name,lower(v_application.guardian_email),v_application.guardian_verified_at,
    v_application.requested_plan_id,'active',p_received_on,'website'
  ) returning id into v_member_id;
  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,
    amount_due_pence,amount_paid_pence,source,application_id,expected_payment_method,created_by_actor_id
  ) values (
    v_member_id,p_plan_price_id,v_year,case when p_received_on>make_date(v_year,1,1) then p_received_on else make_date(v_year,1,1) end,
    make_date(v_year,12,31),make_date(v_year+1,3,1),'paid',p_amount_pence,p_amount_pence,
    'application',v_application.id,v_application.payment_method,v_actor
  ) returning id into v_term_id;
  insert into public.membership_payments(
    term_id,method,status,amount_pence,offline_reference,received_by,received_at,recorded_by_actor_id,cleared_at,cash_receipt_reference
  ) values (
    v_term_id,v_application.payment_method,'paid',p_amount_pence,pg_catalog.btrim(p_payment_reference),p_actor_id,
    p_received_on::timestamptz,v_actor,now(),case when v_application.payment_method='cash' then pg_catalog.btrim(p_payment_reference) else null end
  ) returning id into v_payment_id;
  update public.membership_offline_payment_records set status='cleared',member_id=v_member_id,term_id=v_term_id,
    expected_amount_pence=p_amount_pence,payment_reference=pg_catalog.btrim(p_payment_reference),
    received_on=p_received_on,cleared_on=v_today,recorded_by_actor_id=v_actor,updated_at=now()
  where application_id=v_application.id and status in ('awaiting','received');
  if not found then
    insert into public.membership_offline_payment_records(
      application_id,member_id,term_id,method,status,expected_amount_pence,payment_reference,received_on,cleared_on,
      settings_version_id,recorded_by_actor_id
    ) values (
      v_application.id,v_member_id,v_term_id,v_application.payment_method,'cleared',p_amount_pence,
      pg_catalog.btrim(p_payment_reference),p_received_on,v_today,v_application.payment_settings_version_id,v_actor
    );
  end if;
  update public.membership_applications set status='converted',converted_member_id=v_member_id,
    portal_invitation_status=case when guardian_led then 'not_requested' else portal_invitation_status end,updated_at=now()
    where id=v_application.id;
  if v_application.contact_email is not null then
    insert into public.membership_notifications(member_id,recipient_email,kind,title,body,portal_visible,email_status,deduplication_key)
    values(v_member_id,lower(v_application.contact_email),'membership.activated',
      v_application.full_name||'''s Society membership is active',
      format('%s, your %s membership for %s is active. Payment by %s has been confirmed.',
        v_application.full_name,v_plan.name,v_year,replace(v_application.payment_method,'_',' ')),
      false,'cancelled','membership-activated-'||v_member_id::text||'-'||v_year::text);
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.activated','member',v_member_id::text,
    'Membership activated by confirmed offline payment.',jsonb_build_object(
      'term_year',v_year,'method',v_application.payment_method,'amount_pence',p_amount_pence,
      'contact_role',v_application.contact_role));
  return query select v_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.activate_offline_membership_application(uuid,uuid,integer,text,date,uuid) from public,anon,authenticated;
grant execute on function public.activate_offline_membership_application(uuid,uuid,integer,text,date,uuid) to service_role;

create or replace function public.activate_offline_membership_renewal(
  p_member_id uuid,
  p_plan_price_id uuid,
  p_membership_year integer,
  p_method text,
  p_amount_pence integer,
  p_received_on date,
  p_payment_reference text,
  p_actor_id uuid
)
returns table(member_id uuid,term_id uuid,payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_term_id uuid;
  v_payment_id uuid;
  v_actor uuid;
  v_settings uuid;
  v_subscription public.membership_subscriptions%rowtype;
  v_today date := (pg_catalog.now() at time zone 'Europe/London')::date;
  v_honorary public.honorary_memberships%rowtype;
  v_existing_term public.membership_terms%rowtype;
  v_initial_pending boolean := false;
  v_expected integer;
  v_starts_on date;
begin
  if not public.has_membership_management_capability(p_actor_id) or p_method not in ('cash','bank_transfer','cheque')
    or nullif(pg_catalog.btrim(p_payment_reference),'') is null or p_received_on is null or p_received_on>v_today then
    raise exception 'membership_offline_renewal_invalid';
  end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found or v_member.effective_state in ('suspended','archived') then
    raise exception 'membership_renewal_member_unavailable';
  end if;
  if v_member.effective_state='honorary' then
    select * into v_honorary from public.honorary_memberships honorary
      where honorary.member_id=p_member_id and status in ('active','scheduled')
        and revoked_effective_on is not null and replacement_plan_id is not null
        and extract(year from revoked_effective_on)::integer=p_membership_year;
    if not found then raise exception 'membership_renewal_member_unavailable'; end if;
  end if;
  select price.* into v_price from public.membership_plan_prices price where price.id=p_plan_price_id
    and price.membership_year=p_membership_year and price.active
    and (price.plan_id=v_member.current_plan_id
      or (v_honorary.id is not null and price.plan_id=v_honorary.replacement_plan_id)
      or exists(
      select 1 from public.membership_plan_transitions transition
      where transition.member_id=p_member_id and transition.membership_year=p_membership_year
        and transition.to_plan_id=price.plan_id
        and transition.status in ('scheduled','approved')
    ));
  if not found then raise exception 'membership_renewal_price_unavailable'; end if;
  if p_membership_year < extract(year from p_received_on)::integer
    or p_membership_year > extract(year from p_received_on)::integer+1 then
    raise exception 'membership_renewal_year_invalid';
  end if;
  select term.* into v_existing_term from public.membership_terms term
    where term.member_id=p_member_id and term.membership_year=p_membership_year
    for update;
  v_initial_pending := found
    and v_existing_term.status='scheduled'
    and v_existing_term.amount_paid_pence=0
    and v_existing_term.source in ('officer','application');
  v_expected:=case when v_initial_pending then v_existing_term.amount_due_pence
    when v_honorary.id is not null
      and (extract(month from v_honorary.revoked_effective_on)<>1 or extract(day from v_honorary.revoked_effective_on)<>1)
    then public.prorated_membership_fee_pence(v_price.amount_pence,v_honorary.revoked_effective_on)
    else v_price.amount_pence end;
  v_starts_on:=case when v_initial_pending then v_existing_term.starts_on
    else coalesce(v_honorary.revoked_effective_on,make_date(p_membership_year,1,1)) end;
  if p_amount_pence<>v_expected then raise exception 'membership_renewal_amount_invalid'; end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select id into v_settings from public.membership_payment_settings_versions where active;
  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,
    amount_due_pence,amount_paid_pence,source,expected_payment_method,created_by_actor_id
  ) values (
    p_member_id,p_plan_price_id,p_membership_year,v_starts_on,make_date(p_membership_year,12,31),
    make_date(p_membership_year+1,3,1),'paid',p_amount_pence,p_amount_pence,
    case when v_initial_pending then v_existing_term.source else 'renewal' end,p_method,v_actor
  ) on conflict on constraint membership_terms_member_id_membership_year_key do update set
    plan_price_id=excluded.plan_price_id,status='paid',amount_due_pence=excluded.amount_due_pence,
    amount_paid_pence=excluded.amount_paid_pence,source=excluded.source,expected_payment_method=excluded.expected_payment_method,
    created_by_actor_id=excluded.created_by_actor_id,updated_at=now()
  where public.membership_terms.status in ('scheduled','grace','lapsed') and public.membership_terms.amount_paid_pence=0
  returning id into v_term_id;
  if v_term_id is null then raise exception 'membership_renewal_already_paid'; end if;
  insert into public.membership_payments(
    term_id,method,status,amount_pence,offline_reference,received_by,received_at,recorded_by_actor_id,cleared_at,cash_receipt_reference
  ) values (
    v_term_id,p_method,'paid',p_amount_pence,pg_catalog.btrim(p_payment_reference),p_actor_id,p_received_on::timestamptz,
    v_actor,now(),case when p_method='cash' then pg_catalog.btrim(p_payment_reference) else null end
  ) returning id into v_payment_id;
  insert into public.membership_offline_payment_records(
    member_id,term_id,method,status,expected_amount_pence,payment_reference,received_on,cleared_on,settings_version_id,recorded_by_actor_id
  ) values(p_member_id,v_term_id,p_method,'cleared',p_amount_pence,pg_catalog.btrim(p_payment_reference),p_received_on,v_today,v_settings,v_actor);

  select * into v_subscription from public.membership_subscriptions where public.membership_subscriptions.member_id=p_member_id;
  if found and v_subscription.stripe_subscription_id is not null and v_subscription.status not in ('canceled','incomplete_expired') then
    insert into public.membership_provider_commands(member_id,command_type,stripe_subscription_id,payload,idempotency_key)
    values(p_member_id,'cancel_for_offline_payment',v_subscription.stripe_subscription_id,
      jsonb_build_object('cancel_at_period_end',true,'membership_year',p_membership_year),
      'offline-renewal-cancel-'||v_payment_id::text)
    on conflict(idempotency_key) do nothing;
  end if;
  if (v_honorary.id is null or v_honorary.revoked_effective_on<=v_today)
    and v_member.effective_state not in ('suspended','archived') then
    update public.members set effective_state='active',updated_at=now() where id=p_member_id;
    update public.users set membership_status='active',updated_at=now() where id=v_member.auth_user_id and membership_status='lapsed';
  end if;
  update public.membership_notifications set email_status='cancelled',updated_at=now()
    where public.membership_notifications.member_id=p_member_id and email_status in ('queued','failed')
      and kind in ('membership.renewal-upcoming','membership.renewal-overdue');
  if v_member.contact_email is not null then
    insert into public.membership_notifications(member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key)
    values(p_member_id,v_member.auth_user_id,v_member.contact_email,'membership.renewal-paid',
      v_member.full_name||'''s membership renewal is paid',
      format('%s, your %s membership term is active. Payment of £%s by %s was confirmed.',v_member.full_name,
        p_membership_year,trim(to_char(p_amount_pence/100.0,'FM999999990.00')),replace(p_method,'_',' ')),
      case when v_member.auth_user_id is not null then '/account' else null end,
      'membership-renewal-paid-'||v_payment_id::text);
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.renewal-paid','membership_term',v_term_id::text,
    'Membership renewal paid in full.',jsonb_build_object('member_id',p_member_id,'year',p_membership_year,'method',p_method,'amount_pence',p_amount_pence));
  return query select p_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.activate_offline_membership_renewal(uuid,uuid,integer,text,integer,date,text,uuid) from public,anon,authenticated;
grant execute on function public.activate_offline_membership_renewal(uuid,uuid,integer,text,integer,date,text,uuid) to service_role;

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
  v_today date := (pg_catalog.now() at time zone 'Europe/London')::date;
  v_honorary public.honorary_memberships%rowtype;
  v_expected integer;
  v_starts_on date;
begin
  if p_method<>'stripe' or p_actor_id is not null or p_stripe_checkout_session_id is null
    or p_stripe_customer_id is null or p_stripe_subscription_id is null
    or p_paid_on is null or p_paid_on>v_today then
    raise exception 'membership_stripe_confirmation_invalid';
  end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found or v_member.effective_state in ('suspended','archived') then
    raise exception 'membership_renewal_member_unavailable';
  end if;
  if v_member.effective_state='honorary' then
    select * into v_honorary from public.honorary_memberships honorary
      where honorary.member_id=p_member_id and status in ('active','scheduled')
        and revoked_effective_on is not null and replacement_plan_id is not null
        and extract(year from revoked_effective_on)::integer=p_membership_year;
    if not found then raise exception 'membership_renewal_member_unavailable'; end if;
  end if;
  select price.* into v_price from public.membership_plan_prices price
  where price.id=p_plan_price_id and price.membership_year=p_membership_year and price.active
    and (price.plan_id=v_member.current_plan_id
      or (v_honorary.id is not null and price.plan_id=v_honorary.replacement_plan_id)
      or exists(
      select 1 from public.membership_plan_transitions transition
      where transition.member_id=p_member_id and transition.membership_year=p_membership_year
        and transition.to_plan_id=price.plan_id
        and transition.status in ('scheduled','approved')
    ));
  if not found then raise exception 'membership_renewal_price_unavailable'; end if;
  if p_membership_year < extract(year from p_paid_on)::integer
    or p_membership_year > extract(year from p_paid_on)::integer+1 then
    raise exception 'membership_renewal_year_invalid';
  end if;
  v_expected:=case when v_honorary.id is not null
      and (extract(month from v_honorary.revoked_effective_on)<>1 or extract(day from v_honorary.revoked_effective_on)<>1)
    then public.prorated_membership_fee_pence(v_price.amount_pence,v_honorary.revoked_effective_on)
    else v_price.amount_pence end;
  v_starts_on:=coalesce(v_honorary.revoked_effective_on,make_date(p_membership_year,1,1));
  if p_amount_pence<>v_expected then raise exception 'membership_renewal_amount_invalid'; end if;

  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,
    status,amount_due_pence,amount_paid_pence,source
  ) values (
    p_member_id,p_plan_price_id,p_membership_year,v_starts_on,
    make_date(p_membership_year,12,31),make_date(p_membership_year+1,3,1),
    'paid',p_amount_pence,p_amount_pence,'renewal'
  ) on conflict on constraint membership_terms_member_id_membership_year_key do update set
    plan_price_id=excluded.plan_price_id,status='paid',amount_due_pence=excluded.amount_due_pence,
    amount_paid_pence=excluded.amount_paid_pence,source='renewal',updated_at=now()
  where public.membership_terms.status in ('scheduled','grace','lapsed')
    and public.membership_terms.amount_paid_pence=0
  returning id into v_term_id;
  if v_term_id is null then raise exception 'membership_renewal_already_paid'; end if;

  insert into public.membership_payments(
    term_id,method,status,amount_pence,stripe_checkout_session_id,
    stripe_payment_intent_id,stripe_invoice_id
  ) values (
    v_term_id,'stripe','paid',p_amount_pence,p_stripe_checkout_session_id,
    p_stripe_payment_intent_id,p_stripe_invoice_id
  ) returning id into v_payment_id;

  insert into public.membership_subscriptions(
    member_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,
    cancel_at_period_end,current_period_start,current_period_end,next_charge_at,
    stripe_event_created_at
  ) values (
    p_member_id,p_stripe_customer_id,p_stripe_subscription_id,v_price.stripe_price_id,
    coalesce(p_stripe_subscription_status,'active'),p_cancel_at_period_end,
    p_current_period_start,p_current_period_end,
    case when p_cancel_at_period_end then null else p_current_period_end end,
    p_stripe_event_created_at
  ) on conflict on constraint membership_subscriptions_member_id_key do update set
    stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id,
    stripe_price_id=excluded.stripe_price_id,status=excluded.status,
    cancel_at_period_end=excluded.cancel_at_period_end,
    current_period_start=excluded.current_period_start,
    current_period_end=excluded.current_period_end,next_charge_at=excluded.next_charge_at,
    stripe_event_created_at=excluded.stripe_event_created_at,updated_at=now();

  if p_cancel_at_period_end then
    insert into public.membership_provider_commands(
      member_id,checkout_attempt_id,command_type,stripe_subscription_id,payload,idempotency_key
    ) select p_member_id,attempt.id,'cancel_at_boundary',p_stripe_subscription_id,
      jsonb_build_object('cancel_at_period_end',true),
      'checkout-cancel-at-boundary-'||p_stripe_checkout_session_id
    from public.membership_checkout_attempts attempt
    where attempt.stripe_checkout_session_id=p_stripe_checkout_session_id
    on conflict(idempotency_key) do nothing;
  end if;

  if v_honorary.id is null or v_honorary.revoked_effective_on<=v_today then
    update public.members set effective_state='active',updated_at=now()
      where id=p_member_id and effective_state not in ('suspended','archived');
    update public.users set membership_status='active',updated_at=now()
      where id=v_member.auth_user_id and membership_status='lapsed';
  end if;
  update public.membership_notifications set email_status='cancelled',updated_at=now()
    where public.membership_notifications.member_id=p_member_id
      and email_status in ('queued','failed')
      and kind in ('membership.renewal-upcoming','membership.renewal-overdue');
  if v_member.contact_email is not null then
    insert into public.membership_notifications(
      member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
    ) values (
      p_member_id,v_member.auth_user_id,v_member.contact_email,'membership.renewal-paid',
      v_member.full_name||'''s membership renewal is paid',
      format('%s, your %s membership term is active. Payment of £%s was confirmed.',
        v_member.full_name,p_membership_year,trim(to_char(p_amount_pence/100.0,'FM999999990.00'))),
      case when v_member.auth_user_id is not null then '/account' else null end,
      'membership-renewal-paid-'||v_payment_id::text
    );
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(null,'system','membership.renewal-paid','membership_term',v_term_id::text,
    'Membership renewal paid in full.',jsonb_build_object(
      'member_id',p_member_id,'year',p_membership_year,'method','stripe','amount_pence',p_amount_pence));
  return query select p_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz)
  to service_role;

create or replace function public.claim_membership_provider_commands(
  p_member_id uuid default null,
  p_limit integer default 20
)
returns table(command_id uuid,command_type text,stripe_subscription_id text,payload jsonb,idempotency_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select command.id from public.membership_provider_commands command
    where (p_member_id is null or command.member_id=p_member_id)
      and (
        (command.status in ('queued','failed') and command.next_attempt_at<=now())
        or (command.status='processing' and command.claimed_at<now()-interval '10 minutes')
      )
    order by command.created_at
    for update skip locked
    limit least(greatest(p_limit,1),100)
  ), claimed as (
    update public.membership_provider_commands command set
      status='processing',claimed_at=now(),attempts=command.attempts+1,last_error=null,updated_at=now()
    from candidates where command.id=candidates.id
    returning command.*
  )
  select claimed.id,claimed.command_type,claimed.stripe_subscription_id,claimed.payload,claimed.idempotency_key
  from claimed;
end;
$$;

create or replace function public.complete_membership_provider_command(
  p_command_id uuid,
  p_succeeded boolean,
  p_safe_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_member_id uuid; v_command_type text; v_payload jsonb;
begin
  update public.membership_provider_commands set
    status=case when p_succeeded then 'complete' else 'failed' end,
    completed_at=case when p_succeeded then now() else null end,
    next_attempt_at=case when p_succeeded then next_attempt_at
      else now()+make_interval(secs=>least(21600,greatest(60,power(2,least(attempts,8))::integer*60))) end,
    last_error=case when p_succeeded then null else left(coalesce(p_safe_error,'Provider update failed; retry required.'),500) end,
    claimed_at=null,updated_at=now()
  where id=p_command_id and status='processing'
  returning member_id,command_type,payload into v_member_id,v_command_type,v_payload;
  if not found then return false; end if;
  if p_succeeded and v_command_type in ('cancel_at_boundary','cancel_for_offline_payment','cancel_for_honorary') then
    update public.membership_subscriptions set cancel_at_period_end=true,next_charge_at=null,updated_at=now()
      where member_id=v_member_id;
  elsif p_succeeded and v_command_type='resume_auto_renew' then
    update public.membership_subscriptions set cancel_at_period_end=false,updated_at=now()
      where member_id=v_member_id;
  elsif p_succeeded and v_command_type='transition_price' then
    update public.membership_subscriptions set stripe_price_id=v_payload->>'stripe_price_id',updated_at=now()
      where member_id=v_member_id;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_membership_provider_commands(uuid,integer),
  public.complete_membership_provider_command(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_membership_provider_commands(uuid,integer),
  public.complete_membership_provider_command(uuid,boolean,text) to service_role;

create or replace function public.queue_honorary_subscription_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_subscription public.membership_subscriptions%rowtype;
begin
  select * into v_subscription from public.membership_subscriptions
    where member_id=new.member_id and status not in ('canceled','incomplete_expired');
  if found and v_subscription.stripe_subscription_id is not null then
    insert into public.membership_provider_commands(
      member_id,command_type,stripe_subscription_id,payload,idempotency_key
    ) values (
      new.member_id,'cancel_for_honorary',v_subscription.stripe_subscription_id,
      jsonb_build_object('cancel_at_period_end',true,'honorary_effective_from',new.effective_from),
      'honorary-cancel-'||new.id::text
    ) on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists honorary_queue_subscription_cancellation on public.honorary_memberships;
create trigger honorary_queue_subscription_cancellation
after insert on public.honorary_memberships for each row
execute function public.queue_honorary_subscription_cancellation();

revoke all on function public.queue_honorary_subscription_cancellation() from public,anon,authenticated;
