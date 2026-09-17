-- One-time payments retain the existing legacy subscription webhook contract.
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
    or p_stripe_customer_id is null or p_stripe_payment_intent_id is null
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

  if p_method='stripe' and p_stripe_subscription_id is not null then
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
  if p_method<>'stripe' or p_actor_id is not null or p_cash_receipt_reference is not null or p_stripe_checkout_session_id is null
    or p_stripe_customer_id is null or p_stripe_payment_intent_id is null
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

  if p_stripe_subscription_id is not null then
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


create table public.membership_signup_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  email text not null,
  full_name text not null,
  code_hash text,
  code_expires_at timestamptz,
  sent_at timestamptz not null default now(),
  attempts integer not null default 0,
  verified_at timestamptz,
  expires_at timestamptz not null default now()+interval '30 days',
  draft jsonb not null default '{}',
  application_id uuid references public.membership_applications(id) on delete set null
);
alter table public.membership_signup_sessions enable row level security;
revoke all on public.membership_signup_sessions from public,anon,authenticated;
grant all on public.membership_signup_sessions to service_role;

create or replace function public.verify_membership_signup_code(p_session_hash text,p_code_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.membership_signup_sessions;
begin
  select * into s from public.membership_signup_sessions where session_hash=p_session_hash for update;
  if not found or s.code_hash is null or s.code_expires_at<=now() or s.attempts>=5 then return false; end if;
  update public.membership_signup_sessions set attempts=attempts+1 where id=s.id;
  if s.code_hash<>p_code_hash then return false; end if;
  update public.membership_signup_sessions set verified_at=now(),code_hash=null where id=s.id;
  return true;
end $$;
revoke all on function public.verify_membership_signup_code(text,text) from public,anon,authenticated;
grant execute on function public.verify_membership_signup_code(text,text) to service_role;

alter table public.membership_applications add column manual_verification text not null default 'not_required'
  check(manual_verification in ('not_required','pending','approved','denied'));
-- Serialize matching identities, including two browser sessions submitting together.
create or replace function public.guard_membership_signup_identity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare identity text;
begin
  identity:=lower(regexp_replace(btrim(new.full_name),'\s+',' ','g'));
  perform pg_advisory_xact_lock(hashtextextended(lower(new.contact_email)||':'||identity,0));
  if exists(select 1 from public.members m where lower(m.contact_email)=lower(new.contact_email)
    and lower(regexp_replace(btrim(m.full_name),'\s+',' ','g'))=identity)
    or exists(select 1 from public.membership_applications a where lower(a.contact_email)=lower(new.contact_email)
    and lower(regexp_replace(btrim(a.full_name),'\s+',' ','g'))=identity
    and a.status not in ('expired','converted')) then
    raise exception 'membership_identity_already_exists';
  end if;
  return new;
end $$;
create trigger membership_signup_identity before insert on public.membership_applications
for each row execute function public.guard_membership_signup_identity();

create table public.membership_renewal_campaigns (
  membership_year integer primary key check(membership_year between 2026 and 2200),
  open boolean not null default true,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now()
);
create table public.membership_renewal_invitations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  membership_year integer not null references public.membership_renewal_campaigns(membership_year),
  token_hash text not null unique,
  expires_at timestamptz not null,
  unique(member_id,membership_year)
);
alter table public.membership_renewal_campaigns enable row level security;
alter table public.membership_renewal_invitations enable row level security;
revoke all on public.membership_renewal_campaigns,public.membership_renewal_invitations from public,anon,authenticated;
grant all on public.membership_renewal_campaigns,public.membership_renewal_invitations to service_role;
create or replace function public.review_paid_membership(p_application_id uuid,p_actor uuid,p_decision text,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.membership_applications;
begin
  if not public.has_membership_management_capability(p_actor) or p_decision not in ('approved','denied') or length(btrim(p_reason))<5 then raise exception 'membership_review_forbidden'; end if;
  select * into a from public.membership_applications where id=p_application_id and status='converted' and manual_verification='pending' for update;
  if not found then raise exception 'membership_review_unavailable'; end if;
  update public.membership_applications set manual_verification=p_decision,reviewed_by=p_actor,reviewed_at=now(),review_reason=p_reason where id=a.id;
  if p_decision='denied' then
    update public.members set effective_state='suspended' where id=a.converted_member_id;
    update public.users set membership_status='suspended' where id=(select auth_user_id from public.members where id=a.converted_member_id);
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary)
    values(p_actor,(select role from public.user_roles where user_id=p_actor),'membership.manual-verification','membership_application',a.id::text,p_decision||': '||p_reason);
  insert into public.membership_notifications(member_id,recipient_email,kind,title,body,portal_visible,deduplication_key)
    values(a.converted_member_id,a.contact_email,'membership.manual-verification',
    case when p_decision='approved' then 'Your membership verification is complete' else 'Your membership application update' end,
    case when p_decision='approved' then 'The membership team has completed your routine verification.' else 'Your membership was declined. The membership officer will contact you and arrange the refund manually.' end,false,'manual-verification-'||a.id);
end $$;
revoke all on function public.review_paid_membership(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_paid_membership(uuid,uuid,text,text) to service_role;
-- Persist guardian evidence independently of the Junior's contact number.
alter table public.membership_applications add column guardian_contact_number text;
alter table public.membership_applications add column guardian_consent_version text;
-- Cleanup retains every application associated with a payment attempt for reconciliation.
create or replace function public.cleanup_membership_signup_drafts()
returns void language plpgsql security invoker set search_path='' as $$
begin
  delete from public.membership_signup_sessions where expires_at<now();
  delete from public.membership_notifications n using public.membership_applications a
    where n.application_id=a.id and a.expires_at<now() and a.status='expired'
    and not exists(select 1 from public.membership_checkout_attempts c where c.application_id=a.id)
    and not exists(select 1 from public.membership_offline_payment_records o where o.application_id=a.id);
  delete from public.membership_applications a where expires_at<now() and status='expired'
    and not exists(select 1 from public.membership_checkout_attempts c where c.application_id=a.id)
    and not exists(select 1 from public.membership_offline_payment_records o where o.application_id=a.id)
    and not exists(select 1 from public.membership_terms t where t.application_id=a.id);
end $$;
revoke all on function public.cleanup_membership_signup_drafts() from public,anon,authenticated;
grant execute on function public.cleanup_membership_signup_drafts() to service_role;
select cron.schedule('cleanup-membership-signup-drafts','17 3 * * *','select public.cleanup_membership_signup_drafts()');
-- Allocate portal eligibility only after membership exists (paid activation).
create table public.membership_portal_email_claims (
 email text primary key, member_id uuid not null unique references public.members(id) on delete cascade
);
alter table public.membership_portal_email_claims enable row level security;
revoke all on public.membership_portal_email_claims from public,anon,authenticated;
grant all on public.membership_portal_email_claims to service_role;
create or replace function public.claim_membership_portal_email(p_member_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.members; owner_id uuid;
begin
 select * into m from public.members where id=p_member_id;
 if not found or m.contact_email is null or m.contact_role='guardian' or m.portal_invitation_status in ('declined','not_requested') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('portal:'||lower(m.contact_email),0));
 select member_id into owner_id from public.membership_portal_email_claims where email=lower(m.contact_email);
 if found then return owner_id=m.id; end if;
 if not exists(select 1 from public.membership_terms where member_id=m.id and status='paid') and m.effective_state<>'honorary' then return false; end if;
 if exists(select 1 from public.users where lower(email)=lower(m.contact_email)) then return false; end if;
 select id into owner_id from public.members where lower(contact_email)=lower(m.contact_email)
   and contact_role<>'guardian' and portal_invitation_status not in ('declined','not_requested')
   and (effective_state='honorary' or exists(select 1 from public.membership_terms t where t.member_id=public.members.id and t.status='paid'))
   order by created_at,id limit 1;
 insert into public.membership_portal_email_claims(email,member_id) values(lower(m.contact_email),owner_id);
 return owner_id=m.id;
end $$;
revoke all on function public.claim_membership_portal_email(uuid) from public,anon,authenticated;
grant execute on function public.claim_membership_portal_email(uuid) to service_role;
create or replace function public.finish_simplified_membership_application()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('converted','expired','rejected') then
  update public.membership_notifications set email_status='cancelled',updated_at=now()
   where application_id=new.id and kind='membership.application-payment-reminder' and email_status in ('queued','failed');
 end if;
 if new.manual_verification='denied' and old.manual_verification is distinct from 'denied' then
  insert into public.membership_notifications(member_id,recipient_user_id,kind,title,body,action_href,email_status,portal_visible,deduplication_key)
  select new.converted_member_id,o.user_id,'membership.manual-refund-officer','Arrange manual membership refund',
   new.full_name||' was denied membership. Arrange and record the refund manually. Reason: '||coalesce(new.review_reason,''),
   '/admin/memberships?view=payments','cancelled',true,'manual-refund-'||new.id||'-'||o.user_id
  from (select user_id from public.user_roles where role='administrator' union select user_id from public.user_capabilities where capability='memberships.manage') o;
 end if;
 return new;
end $$;
create trigger finish_simplified_membership_application after update on public.membership_applications
for each row execute function public.finish_simplified_membership_application();
-- Campaign invitations replace the old calendar-driven notices and account-only links.
create or replace function public.suppress_legacy_membership_renewal_notice()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind in ('membership.renewal-upcoming','membership.renewal-overdue') then return null; end if;
 return new;
end $$;
create trigger a_suppress_legacy_membership_renewal_notice before insert on public.membership_notifications
for each row execute function public.suppress_legacy_membership_renewal_notice();
create or replace function public.queue_membership_renewal_invitation(p_member_id uuid,p_year integer,p_actor uuid,p_token text,p_token_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.members; invitation uuid; target_plan uuid; age integer;
begin
 if not public.has_membership_management_capability(p_actor) or not exists(select 1 from public.membership_renewal_campaigns where membership_year=p_year and open) then raise exception 'membership_campaign_unavailable'; end if;
 select * into m from public.members where id=p_member_id for update;
 if not found or m.effective_state not in ('active','grace','lapsed') or exists(select 1 from public.membership_terms where member_id=m.id and membership_year=p_year and (status='paid' or amount_paid_pence>0)) then return false; end if;
 -- Resolve age changes when the officer opens renewals, even before November.
 age:=public.membership_age_on(m.date_of_birth,make_date(p_year,1,1));
 select target.id into target_plan from public.membership_plans current_plan join public.membership_plans target on target.slug=case
  when age>=80 and current_plan.slug<>'concession' then 'concession'
  when current_plan.slug='junior' and age>=18 then 'adult'
  when current_plan.slug='student' and age>=25 then 'adult' else null end and target.active
 where current_plan.id=m.current_plan_id;
 if target_plan is not null then
  insert into public.membership_plan_transitions(member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on)
  values(m.id,p_year,m.current_plan_id,target_plan,'age','scheduled',make_date(p_year,1,1))
  on conflict(member_id,membership_year) do nothing;
 end if;
 insert into public.membership_renewal_invitations(member_id,membership_year,token_hash,expires_at)
 values(m.id,p_year,p_token_hash,make_timestamptz(p_year+1,1,1,0,0,0,'Europe/London'))
 on conflict(member_id,membership_year) do nothing returning id into invitation;
 if invitation is null then return false; end if;
 insert into public.membership_notifications(member_id,recipient_email,recipient_user_id,kind,title,body,action_href,portal_visible,deduplication_key)
 values(m.id,m.contact_email,m.auth_user_id,
 case when m.contact_email is null then 'membership.manual-contact-officer' else 'membership.renewal-invitation' end,
 'Renew '||m.full_name||'''s '||p_year||' membership',
 case when m.contact_email is null then 'Contact '||m.full_name||' to arrange their renewal.' else 'Annual renewals are open. Follow your personal link to check the fee and make a one-time payment.' end,
 case when m.contact_email is null then null else '/membership/renew?token='||p_token end,m.auth_user_id is not null,
 'renewal-invitation-'||m.id||'-'||p_year);
 return true;
end $$;
revoke all on function public.queue_membership_renewal_invitation(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_membership_renewal_invitation(uuid,integer,uuid,text,text) to service_role;
