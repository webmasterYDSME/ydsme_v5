-- One place says when the renewal grace period ends, and everything follows it.
--
-- Until now "1 March" was typed into about twenty functions: the daily job that lapses members, the date
-- stored on every membership term, the grace notice, and (since 202609210001) the renewal link expiry. If the
-- grace period ever changed, some of those would have been missed. Now:
--
--   membership_grace_ends_on(year)  the day the grace period for renewing <year> ends. It is the first day a
--                                   member who has not renewed <year> counts as lapsed (today 1 March <year>).
--                                   CHANGE THE GRACE PERIOD HERE, with a new migration that replaces this function.
--
-- and these read it:
--   * the renewal link expiry: an invitation for <year> works until the end of the day before it, so the link
--     and the "The link works until ..." line in the email stop when the grace period stops;
--   * the grace end stored on each membership term (a BEFORE INSERT trigger; the ~20 functions that still pass
--     their own value are overridden, so no function needs rewriting when the rule changes);
--   * the daily job (members go from grace to lapsed on that day) and the grace notice wording;
--   * the payment-review "replace" outcome and the December application checkout, which decide grace or lapsed.
--
-- Not changed by design: terms that already exist keep the grace end they were created with, and renewal
-- invitations that have already been issued keep their expiry (their emails already told the member that date).
-- Grace still starts on 1 January, when the term the member paid for ends.


create or replace function public.membership_grace_ends_on(p_year integer)
returns date language sql immutable set search_path='' as $$
 select make_date(p_year,3,1);
$$;

-- "1 March" and "1 March 2027", for messages.
create or replace function public.membership_day_month_text(p_day date)
returns text language sql immutable set search_path='' as $$
 select extract(day from p_day)::integer||' '
  ||(array['January','February','March','April','May','June','July','August','September','October','November','December'])[extract(month from p_day)::integer];
$$;

create or replace function public.membership_long_date_text(p_day date)
returns text language sql immutable set search_path='' as $$
 select public.membership_day_month_text(p_day)||' '||extract(year from p_day)::integer;
$$;

-- The renewal link for <year> stops working when the grace period for <year> ends, at the start of that day in London.
create or replace function public.membership_renewal_link_expires_at(p_year integer)
returns timestamptz language sql stable security invoker set search_path='' as $$
 select (public.membership_grace_ends_on(p_year)::timestamp) at time zone 'Europe/London';
$$;

-- The last day the link works, for the email: the day before the expiry moment, as "28 February 2027".
create or replace function public.membership_renewal_link_last_day_text(p_member_id uuid, p_year integer)
returns text language sql stable security invoker set search_path='' as $$
 select public.membership_long_date_text((((coalesce(
   (select i.expires_at from public.membership_renewal_invitations i where i.member_id=p_member_id and i.membership_year=p_year),
   public.membership_renewal_link_expires_at(p_year))) at time zone 'Europe/London') - interval '1 second')::date);
$$;

-- The grace end stored on a new term always comes from the rule. The term for <year> ends on 31 December <year>;
-- its grace period is the one that ends when renewing <year>+1 falls due.
create or replace function public.set_membership_term_grace_end()
returns trigger language plpgsql set search_path='' as $$
begin
 new.grace_ends_on := public.membership_grace_ends_on(new.membership_year+1);
 return new;
end $$;

drop trigger if exists membership_terms_set_grace_end on public.membership_terms;
create trigger membership_terms_set_grace_end before insert on public.membership_terms
 for each row execute function public.set_membership_term_grace_end();


-- The daily job lapses members on the day the rule gives (was: 1 March typed in).
CREATE OR REPLACE FUNCTION public.run_membership_daily(p_today date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if p_today = public.membership_grace_ends_on(v_year) then
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
        else 'Your membership is in its renewal grace period. Please renew before '||public.membership_day_month_text(public.membership_grace_ends_on(v_year))||' to retain portal access.' end,
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
$function$;

-- The grace notice names the date from the rule.
CREATE OR REPLACE FUNCTION public.notify_membership_state_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.effective_state=old.effective_state then return new; end if;
  if new.effective_state='grace' then
    v_kind:='membership.grace'; v_title:='Your membership is in its grace period';
    v_body:='Account access continues until the grace period ends. Complete renewal before '
      ||public.membership_day_month_text(public.membership_grace_ends_on(extract(year from current_date)::integer))||' to avoid a lapse.';
  elsif new.effective_state='lapsed' then
    v_kind:='membership.lapsed'; v_title:='Your membership has lapsed';
    v_body:='The renewal grace period has ended and account access is now closed. A complete online or offline renewal can reinstate membership.';
  elsif new.effective_state='active' and old.effective_state in ('grace','lapsed','payment_review') then
    v_kind:='membership.reinstated'; v_title:='Your membership is active again';
    v_body:='Your paid membership and account access have been reinstated.';
  else return new;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    new.id,new.auth_user_id,new.contact_email,v_kind,v_title,v_body,'/account',
    'membership-state-' || new.id::text || '-' || new.effective_state || '-' || current_date::text
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$function$;

-- Replacing a payment under review decides grace or lapsed from the rule.
CREATE OR REPLACE FUNCTION public.resolve_membership_payment_review(p_term_id uuid, p_resolution text, p_reason text, p_actor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_term public.membership_terms%rowtype;
  v_member public.members%rowtype;
  v_new_state text;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or p_resolution not in ('retain','replace','lapse')
    or nullif(btrim(p_reason),'') is null or char_length(btrim(p_reason))<5 then
    raise exception 'membership_payment_review_resolution_invalid';
  end if;
  select * into v_term from public.membership_terms where id=p_term_id and status='payment_review' for update;
  if not found then raise exception 'membership_payment_review_unavailable'; end if;
  select * into v_member from public.members where id=v_term.member_id for update;
  if p_resolution='retain' then
    update public.membership_terms set status='paid', updated_at=now() where id=v_term.id;
    v_new_state := 'active';
  elsif p_resolution='replace' then
    update public.membership_terms set status='void', amount_paid_pence=0, updated_at=now() where id=v_term.id;
    v_new_state := case when current_date < public.membership_grace_ends_on(extract(year from current_date)::integer)
      then 'grace' else 'lapsed' end;
  else
    update public.membership_terms set status='lapsed', updated_at=now() where id=v_term.id;
    v_new_state := 'lapsed';
  end if;
  if v_member.effective_state not in ('honorary','suspended','archived') then
    update public.members set effective_state=v_new_state, updated_at=now() where id=v_member.id;
    if v_member.auth_user_id is not null then
      update public.users set membership_status=case when v_new_state='lapsed' then 'lapsed' else 'active' end,
        updated_at=now() where id=v_member.auth_user_id;
    end if;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    v_member.id,v_member.auth_user_id,v_member.contact_email,'membership.payment-review-resolved',
    'Your membership payment review is complete',
    case p_resolution
      when 'retain' then 'A membership officer retained your paid entitlement after review.'
      when 'replace' then 'The reviewed payment no longer covers this term. Please arrange a replacement online or offline payment.'
      else 'Your paid entitlement ended following the payment review.' end,
    '/account','membership-review-resolved-' || v_term.id::text || '-' || p_resolution
  );
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state)
  values(p_actor_id,'committee','membership.payment-review-resolved','membership_term',v_term.id::text,
    'Membership payment review resolved.',jsonb_build_object('status',v_term.status),
    jsonb_build_object('resolution',p_resolution,'reason',btrim(p_reason),'member_state',v_new_state));
  return true;
end;
$function$;

-- A December application checkout decides grace or lapsed from the rule, and stores the grace end from it.
CREATE OR REPLACE FUNCTION public.activate_membership_application_checkout(p_application_id uuid, p_plan_price_id uuid, p_method text, p_amount_pence integer, p_actor_id uuid DEFAULT NULL::uuid, p_cash_receipt_reference text DEFAULT NULL::text, p_stripe_checkout_session_id text DEFAULT NULL::text, p_stripe_payment_intent_id text DEFAULT NULL::text, p_stripe_invoice_id text DEFAULT NULL::text, p_stripe_customer_id text DEFAULT NULL::text, p_stripe_subscription_id text DEFAULT NULL::text, p_stripe_subscription_status text DEFAULT NULL::text, p_cancel_at_period_end boolean DEFAULT false, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_stripe_event_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(member_id uuid, term_id uuid, payment_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_attempt public.membership_checkout_attempts;
  v_quote_date date;
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

  if p_method<>'stripe' or p_stripe_event_created_at is null or p_stripe_event_created_at>now()+interval '5 minutes' then
    raise exception 'membership_checkout_payment_time_invalid';
  end if;
  select * into v_attempt from public.membership_checkout_attempts
    where stripe_checkout_session_id=p_stripe_checkout_session_id and application_id=p_application_id
      and purpose='application' and plan_price_id=p_plan_price_id and amount_pence=p_amount_pence;
  if not found then raise exception 'membership_checkout_quote_mismatch'; end if;
  v_quote_date:=(v_attempt.created_at at time zone 'Europe/London')::date;
  v_today:=(p_stripe_event_created_at at time zone 'Europe/London')::date;
  if p_stripe_event_created_at<v_attempt.created_at-interval '5 minutes' then
    raise exception 'membership_checkout_payment_time_invalid';
  end if;

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

  -- A paid Checkout may arrive after application retention marked it expired.
  if v_application.status='expired' and p_stripe_event_created_at<=v_application.expires_at then
    update public.membership_applications set status='awaiting_payment' where id=v_application.id;
    v_application.status:='awaiting_payment';
  end if;
  if (p_method='cash' and v_application.status<>'awaiting_cash')
    or (p_method='stripe' and v_application.status<>'awaiting_payment')
    or v_application.payment_method<>p_method then
    raise exception 'membership_application_not_payable';
  end if;

  select price.* into v_price from public.membership_plan_prices price
  where price.id=p_plan_price_id and price.plan_id=v_application.requested_plan_id ;
  if not found then raise exception 'membership_price_unavailable'; end if;
  select * into v_plan from public.membership_plans where id=v_price.plan_id and active;
  if not found then raise exception 'membership_plan_unavailable'; end if;

  v_year:=v_attempt.membership_year;
  v_expected:=public.prorated_membership_fee_pence(v_price.amount_pence,v_quote_date);
  if public.membership_billing_year(v_quote_date)<>v_year or v_price.membership_year<>v_year or p_amount_pence<>v_expected then
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
    v_application.requested_plan_id,
    case when (v_now at time zone 'Europe/London')::date<=make_date(v_year,12,31) then 'active'
      when (v_now at time zone 'Europe/London')::date<public.membership_grace_ends_on(v_year+1) then 'grace' else 'lapsed' end,
    v_today,'website'
  ) returning id into v_member_id;

  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,
    status,amount_due_pence,amount_paid_pence,source,application_id
  ) values (
    v_member_id,p_plan_price_id,v_year,v_today,make_date(v_year,12,31),
    public.membership_grace_ends_on(v_year+1),'paid',p_amount_pence,p_amount_pence,'application',v_application.id
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
$function$;
