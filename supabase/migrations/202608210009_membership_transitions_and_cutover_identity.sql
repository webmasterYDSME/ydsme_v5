-- Student requests, transition-safe renewal pricing, and shared-address
-- MemberMojo cutover ownership.

create or replace function public.request_own_student_membership(p_membership_year integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_current_plan public.membership_plans%rowtype;
  v_student_plan public.membership_plans%rowtype;
  v_transition_id uuid;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_age integer;
begin
  if auth.uid() is null or extract(month from v_today)<>11 or extract(day from v_today)>30
    or p_membership_year<>extract(year from v_today)::integer+1 then
    raise exception 'membership_student_request_closed';
  end if;
  select * into v_member from public.members where auth_user_id=auth.uid() for update;
  if not found or v_member.date_of_birth is null or v_member.effective_state in ('honorary','suspended','archived') then
    raise exception 'membership_student_request_unavailable';
  end if;
  select * into v_current_plan from public.membership_plans where id=v_member.current_plan_id;
  select * into v_student_plan from public.membership_plans where slug='student' and active;
  v_age:=public.membership_age_on(v_member.date_of_birth,make_date(p_membership_year,1,1));
  if v_current_plan.slug<>'adult' or v_age<18 or v_age>24 or v_student_plan.id is null then
    raise exception 'membership_student_request_ineligible';
  end if;
  insert into public.membership_plan_transitions(
    member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on,requested_at
  ) values (
    v_member.id,p_membership_year,v_member.current_plan_id,v_student_plan.id,'student_request',
    'awaiting_student_review',make_date(p_membership_year,1,1),now()
  ) on conflict(member_id,membership_year) do update set
    to_plan_id=excluded.to_plan_id,reason='student_request',status='awaiting_student_review',
    requested_at=now(),reviewed_by_actor_id=null,reviewed_at=null,review_reason=null,updated_at=now()
  where public.membership_plan_transitions.status not in ('applied','approved')
  returning id into v_transition_id;
  if v_transition_id is null then raise exception 'membership_student_request_unavailable'; end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
  ) select v_member.id,officer.user_id,'membership.student-request-officer',
    'Student membership request to review',
    v_member.full_name||' requested Student membership for '||p_membership_year||'. Payment is paused until a decision is recorded.',
    '/admin/memberships?section=student-requests#student-requests','cancelled',
    'student-request-'||v_transition_id::text||'-'||officer.user_id::text
  from (
    select role.user_id from public.user_roles role where role.role='administrator'
    union select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
  ) officer on conflict(deduplication_key) do nothing;
  return v_transition_id;
end;
$$;

create or replace function public.review_student_membership_request(
  p_transition_id uuid,
  p_approved boolean,
  p_reason text,
  p_actor_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare v_transition public.membership_plan_transitions%rowtype; v_member public.members%rowtype; v_actor uuid;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or char_length(coalesce(btrim(p_reason),''))<5 then
    raise exception 'membership_student_review_invalid';
  end if;
  select * into v_transition from public.membership_plan_transitions
    where id=p_transition_id and status='awaiting_student_review' for update;
  if not found then raise exception 'membership_student_review_unavailable'; end if;
  v_actor:=public.ensure_administrative_actor(p_actor_id);
  update public.membership_plan_transitions set
    status=case when p_approved then 'approved' else 'rejected' end,
    reviewed_by_actor_id=v_actor,reviewed_at=now(),review_reason=btrim(p_reason),updated_at=now()
    where id=v_transition.id;
  select * into v_member from public.members where id=v_transition.member_id;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    v_member.id,v_member.auth_user_id,v_member.contact_email,
    case when p_approved then 'membership.student-request-approved' else 'membership.student-request-rejected' end,
    v_member.full_name||case when p_approved then '''s Student membership is approved' else '''s Student membership request was not approved' end,
    case when p_approved
      then format('%s, Student membership is approved for %s. The correct fee is now ready for renewal.',v_member.full_name,v_transition.membership_year)
      else format('%s, Adult membership remains the default for %s. %s',v_member.full_name,v_transition.membership_year,btrim(p_reason)) end,
    case when v_member.auth_user_id is null then null else '/account' end,
    'student-request-decision-'||v_transition.id::text
  );
  insert into public.audit_logs(actor_user_id,actor_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,v_actor,'committee','membership.student-request-reviewed','membership_plan_transition',v_transition.id::text,
    'Student membership request reviewed.',jsonb_build_object('approved',p_approved,'reason',btrim(p_reason)));
  return true;
end;
$$;

revoke all on function public.request_own_student_membership(integer) from public,anon;
grant execute on function public.request_own_student_membership(integer) to authenticated;
revoke all on function public.review_student_membership_request(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.review_student_membership_request(uuid,boolean,text,uuid) to service_role;

create or replace function public.queue_approved_plan_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_subscription public.membership_subscriptions%rowtype; v_price public.membership_plan_prices%rowtype;
begin
  if new.status not in ('scheduled','approved') or (tg_op='UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;
  select * into v_subscription from public.membership_subscriptions
    where member_id=new.member_id and status not in ('canceled','incomplete_expired');
  select * into v_price from public.membership_plan_prices
    where plan_id=new.to_plan_id and membership_year=new.membership_year and active
    order by version desc limit 1;
  if v_subscription.stripe_subscription_id is not null and v_price.stripe_price_id is not null then
    insert into public.membership_provider_commands(
      member_id,command_type,stripe_subscription_id,payload,idempotency_key
    ) values (
      new.member_id,'transition_price',v_subscription.stripe_subscription_id,
      jsonb_build_object('stripe_price_id',v_price.stripe_price_id,'plan_price_id',v_price.id,'membership_year',new.membership_year),
      'plan-transition-price-'||new.id::text||'-'||new.status
    ) on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_approved_plan_transition on public.membership_plan_transitions;
create trigger queue_approved_plan_transition
after insert or update of status on public.membership_plan_transitions for each row
execute function public.queue_approved_plan_transition();
revoke all on function public.queue_approved_plan_transition() from public,anon,authenticated;

create or replace function public.apply_membership_plan_transitions(p_today date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with applicable as (
    select transition.id,transition.member_id,transition.to_plan_id
    from public.membership_plan_transitions transition
    where transition.status in ('scheduled','approved') and transition.effective_on<=p_today
      and not exists(
        select 1 from public.membership_terms term
        join public.membership_plan_prices price on price.id=term.plan_price_id
        where term.member_id=transition.member_id and term.membership_year=transition.membership_year
          and term.status='paid' and price.plan_id<>transition.to_plan_id
      )
    for update of transition
  ), applied as (
    update public.membership_plan_transitions transition set status='applied',updated_at=now()
    from applicable where transition.id=applicable.id
    returning applicable.member_id,applicable.to_plan_id
  )
  update public.members member set current_plan_id=applied.to_plan_id,updated_at=now()
  from applied where member.id=applied.member_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_membership_plan_transitions(date) from public,anon,authenticated;
grant execute on function public.apply_membership_plan_transitions(date) to service_role;

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
  v_subscription public.membership_subscriptions%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_term_id uuid;
  v_year integer := extract(year from (p_event_created_at at time zone 'Europe/London'))::integer;
  v_transition public.membership_plan_transitions%rowtype;
begin
  select subscription.* into v_subscription from public.membership_subscriptions subscription
    where subscription.stripe_subscription_id=p_stripe_subscription_id for update;
  if not found then return null; end if;
  select * into v_member from public.members where id=v_subscription.member_id for update;
  if not found then return null; end if;
  select * into v_transition from public.membership_plan_transitions
    where member_id=v_member.id and membership_year=v_year and status in ('scheduled','approved') limit 1;
  select price.* into v_price from public.membership_plan_prices price
    where price.membership_year=v_year and price.active and (
      price.stripe_price_id=v_subscription.stripe_price_id
      or (v_transition.id is not null and price.plan_id=v_transition.to_plan_id)
      or price.plan_id=v_member.current_plan_id
    )
    order by case when price.stripe_price_id=v_subscription.stripe_price_id then 0
      when v_transition.id is not null and price.plan_id=v_transition.to_plan_id then 1 else 2 end,
      price.version desc limit 1;
  if not found then return v_member.id; end if;

  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,
    status,amount_due_pence,amount_paid_pence,source
  ) values (
    v_member.id,v_price.id,v_year,make_date(v_year,1,1),make_date(v_year,12,31),make_date(v_year+1,3,1),
    case when p_paid then 'paid' else 'grace' end,v_price.amount_pence,
    case when p_paid then least(p_amount_paid_pence,v_price.amount_pence) else 0 end,'renewal'
  ) on conflict(member_id,membership_year) do update set
    plan_price_id=case when p_paid then excluded.plan_price_id else public.membership_terms.plan_price_id end,
    status=case when p_paid then 'paid' else public.membership_terms.status end,
    amount_paid_pence=case when p_paid then least(p_amount_paid_pence,excluded.amount_due_pence) else public.membership_terms.amount_paid_pence end,
    amount_due_pence=case when p_paid then excluded.amount_due_pence else public.membership_terms.amount_due_pence end,
    updated_at=now()
  returning id into v_term_id;

  insert into public.membership_payments(
    term_id,method,status,amount_pence,stripe_invoice_id,stripe_payment_intent_id,stripe_charge_id
  ) values (
    v_term_id,'stripe',case when p_paid then 'paid' else 'failed' end,
    greatest(case when p_paid then p_amount_paid_pence else v_price.amount_pence end,1),
    p_stripe_invoice_id,p_stripe_payment_intent_id,p_stripe_charge_id
  ) on conflict(stripe_invoice_id) do update set
    status=excluded.status,amount_pence=excluded.amount_pence,
    stripe_payment_intent_id=coalesce(excluded.stripe_payment_intent_id,public.membership_payments.stripe_payment_intent_id),
    stripe_charge_id=coalesce(excluded.stripe_charge_id,public.membership_payments.stripe_charge_id),updated_at=now();

  if p_paid and v_transition.id is not null and v_price.plan_id=v_transition.to_plan_id then
    update public.membership_plan_transitions set status='applied',updated_at=now() where id=v_transition.id;
    update public.members set current_plan_id=v_transition.to_plan_id,updated_at=now() where id=v_member.id;
  end if;
  if p_paid and v_member.effective_state not in ('honorary','suspended','archived') then
    update public.members set effective_state='active',updated_at=now() where id=v_member.id;
    update public.users set membership_status='active',updated_at=now()
      where id=v_member.auth_user_id and membership_status='lapsed';
  elsif not p_paid and v_member.effective_state='active' then
    update public.members set effective_state='grace',updated_at=now() where id=v_member.id;
  end if;
  return v_member.id;
end;
$$;

revoke all on function public.reconcile_membership_invoice(text,text,text,text,integer,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function public.reconcile_membership_invoice(text,text,text,text,integer,boolean,timestamptz)
  to service_role;

-- Preserve explicit, unambiguous legacy links, but never let one Auth account
-- own more than one imported person.
create or replace function public.execute_membermojo_final_membership_cutover(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'membermojo_cutover_actor_invalid'; end if;
  if exists(select 1 from public.audit_logs where action='membership.membermojo-cutover-staged') then
    raise exception 'membermojo_final_cutover_already_completed';
  end if;

  insert into public.membership_migration_reviews(membership_record_id,review_kind,summary)
  select record.id,'portal_conflict','One website login was linked to more than one imported person. Each person needs a separate login or must remain correspondence-only.'
  from public.membership_records record
  where record.source='membermojo' and record.auth_user_id is not null
    and (select count(*) from public.membership_records other where other.auth_user_id=record.auth_user_id and other.membership_ended_at is null)>1
  on conflict do nothing;
  update public.membership_records record set auth_user_id=null,updated_at=now()
  where record.source='membermojo' and record.auth_user_id is not null
    and (select count(*) from public.membership_records other where other.auth_user_id=record.auth_user_id and other.membership_ended_at is null)>1;

  update public.membership_records record set auth_user_id=profile.id,updated_at=now()
  from public.users profile
  where record.source='membermojo' and record.auth_user_id is null and record.contact_email is not null
    and lower(profile.email)=lower(record.contact_email)
    and (select count(*) from public.membership_records candidate
      where candidate.source='membermojo' and candidate.membership_ended_at is null
        and lower(candidate.contact_email)=lower(record.contact_email))=1
    and not exists(select 1 from public.membership_records linked where linked.auth_user_id=profile.id);

  select public.stage_membermojo_membership_cutover(p_actor_id) into v_result;
  update public.members member set
    contact_role='shared_household',
    portal_invitation_status=case when member.auth_user_id is null then 'blocked_shared' else member.portal_invitation_status end,
    updated_at=now()
  from public.membership_records record
  where member.legacy_membership_record_id=record.id and record.contact_email is not null
    and (select count(*) from public.membership_records other
      where other.membership_ended_at is null and lower(other.contact_email)=lower(record.contact_email))>1;
  return v_result;
end;
$$;

revoke all on function public.execute_membermojo_final_membership_cutover(uuid) from public,anon,authenticated;
grant execute on function public.execute_membermojo_final_membership_cutover(uuid) to service_role;
