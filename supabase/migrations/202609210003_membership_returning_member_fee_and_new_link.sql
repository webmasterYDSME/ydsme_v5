-- Returning members: a fresh renewal link from the officer, and a part-year fee like a new member pays.
--
-- 1. A member who has lapsed cannot sign in, and their old renewal link stopped working when the grace period
--    ended. The membership officer can now send them a new personal link (reissue_membership_renewal_link).
--    The link lasts 30 days and the email names the last day. It is only for lapsed members, only while
--    renewals are open for the year being paid for, and it is recorded in the audit log. Nothing is sent
--    unless an officer asks.
--
-- 2. A lapsed member who comes back part-way through the year pays the same part-year fee a new member
--    would: the annual fee times the months left in the year, with December counting as a full year (the
--    same prorated_membership_fee_pence rule). This applies only to paying for the current calendar year.
--    A member who is still in their grace period, or who pays for next year, pays the full fee. The fee is
--    worked out in one place (membership_returning_member_fee_pence) and used by the email, the card payment
--    and the officer's cash / cheque / bank transfer entry, so they always agree.
--
-- 3. The "lapsed" email now says what to do next: the membership officer will send a renewal link.
--
-- Needs 202609210001 and 202609210002 applied first.

-- ---------------------------------------------------------------------------------------------
-- The fee
-- ---------------------------------------------------------------------------------------------

create or replace function public.membership_returning_member_fee_pence(
  p_member_id uuid, p_year integer, p_annual_pence integer, p_on date)
returns integer language sql stable security invoker set search_path='' as $$
 select case
  when exists(select 1 from public.members m where m.id=p_member_id and m.effective_state='lapsed')
   and p_year=extract(year from p_on)::integer
  then public.prorated_membership_fee_pence(p_annual_pence,p_on)
  else p_annual_pence end;
$$;
revoke all on function public.membership_returning_member_fee_pence(uuid,integer,integer,date) from public,anon,authenticated;
grant execute on function public.membership_returning_member_fee_pence(uuid,integer,integer,date) to service_role;

-- The quote gains a flag saying the fee is a part-year fee, so the email can explain it.
drop function if exists public.membership_renewal_quote(uuid,integer);
create function public.membership_renewal_quote(
  p_member_id uuid, p_year integer,
  out plan_name text, out previous_name text, out fee_pence integer, out part_year boolean)
language plpgsql stable security invoker set search_path='' as $$
declare m public.members; t public.membership_plan_transitions; target_id uuid; annual integer;
begin
 select * into m from public.members where id=p_member_id;
 if not found or m.current_plan_id is null then return; end if;
 select * into t from public.membership_plan_transitions
  where member_id=p_member_id and membership_year=p_year
   and status in ('scheduled','approved','awaiting_student_review');
 -- A pending Student request decides the fee, so no amount can be quoted yet.
 if t.id is not null and t.status='awaiting_student_review' then return; end if;
 target_id:=coalesce(t.to_plan_id,m.current_plan_id);
 select name into plan_name from public.membership_plans where id=target_id;
 select amount_pence into annual from public.membership_plan_prices
  where plan_id=target_id and active and membership_year<=p_year
  order by membership_year desc, version desc limit 1;
 if plan_name is null or annual is null then plan_name:=null; return; end if;
 fee_pence:=public.membership_returning_member_fee_pence(p_member_id,p_year,annual,(now() at time zone 'Europe/London')::date);
 part_year:=fee_pence<annual;
 if t.id is not null and t.from_plan_id is distinct from t.to_plan_id then
  select name into previous_name from public.membership_plans where id=t.from_plan_id;
 end if;
end $$;
revoke all on function public.membership_renewal_quote(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_quote(uuid,integer) to service_role;

create or replace function public.membership_renewal_fee_text(p_member_id uuid, p_year integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare q record;
begin
 select * into q from public.membership_renewal_quote(p_member_id,p_year);
 if q.fee_pence is null then return null; end if;
 return 'Membership: '||q.plan_name||E'\nFee for '||p_year||': £'||to_char(q.fee_pence/100.0,'FM999990.00')
  ||case when q.part_year
   then E'\nThis is the part-year fee for a returning member. It is worked out from the month you rejoin, the same as for a new member.' else '' end
  ||case when q.previous_name is not null
   then E'\nYour membership type changes from '||q.previous_name||' to '||q.plan_name||' for '||p_year||'.' else '' end;
end $$;
revoke all on function public.membership_renewal_fee_text(uuid,integer) from public,anon,authenticated;
grant execute on function public.membership_renewal_fee_text(uuid,integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- A new link for a lapsed member
-- ---------------------------------------------------------------------------------------------

-- The email goes out straight away (it is one email an officer asked for), not through the bulk queue.
create or replace function public.classify_membership_notification_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A test email or a single new renewal link an officer asks for is immediate, even though it looks like a
  -- renewal invitation. Guardian copies keep the same key with a suffix.
  new.delivery_class := case
    when new.deduplication_key like 'renewal-test-%' or new.deduplication_key like 'renewal-link-%' then 'immediate'
    else public.membership_notification_delivery_class(new.kind)
  end;
  return new;
end;
$$;
revoke all on function public.classify_membership_notification_delivery() from public, anon, authenticated;

-- Returns the last moment the new link works. Raises one of: membership_link_not_allowed,
-- membership_link_year_invalid, membership_link_campaign_closed, membership_link_member_unavailable,
-- membership_link_no_email.
create or replace function public.reissue_membership_renewal_link(
  p_member_id uuid, p_year integer, p_actor uuid, p_token text, p_token_hash text)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare
  m public.members;
  v_today date:=(now() at time zone 'Europe/London')::date;
  v_expires timestamptz;
begin
 if not public.has_membership_management_capability(p_actor) then raise exception 'membership_link_not_allowed'; end if;
 -- Only the year being paid for now: this year, or next year during December.
 if p_year is distinct from public.membership_billing_year(v_today) then raise exception 'membership_link_year_invalid'; end if;
 if not exists(select 1 from public.membership_renewal_campaigns where membership_year=p_year and open) then
  raise exception 'membership_link_campaign_closed';
 end if;
 select * into m from public.members where id=p_member_id for update;
 if not found or m.effective_state<>'lapsed'
  or exists(select 1 from public.membership_terms t where t.member_id=m.id and t.membership_year=p_year and (t.status='paid' or t.amount_paid_pence>0))
  or public.membership_honorary_covers_year(m.id,p_year) then raise exception 'membership_link_member_unavailable'; end if;
 if m.contact_email is null then raise exception 'membership_link_no_email'; end if;
 perform public.ensure_membership_age_transition(m.id,p_year);
 -- 30 days, counting today as the first: the link works through the whole of the 30th day. A link that
 -- already runs longer than that is never shortened.
 v_expires:=greatest(
  coalesce((select i.expires_at from public.membership_renewal_invitations i where i.member_id=m.id and i.membership_year=p_year),'-infinity'::timestamptz),
  ((v_today+31)::timestamp) at time zone 'Europe/London');
 insert into public.membership_renewal_invitations(member_id,membership_year,token_hash,expires_at)
 values(m.id,p_year,p_token_hash,v_expires)
 on conflict(member_id,membership_year) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
 -- An earlier invitation email that has not gone yet would carry a link that no longer works.
 update public.membership_notifications set email_status='cancelled',updated_at=now()
  where member_id=m.id and email_status in ('queued','failed')
   and kind in ('membership.renewal-invitation','membership.renewal-reminder')
   and action_href is not null and action_href like '/membership/renew?token=%';
 insert into public.membership_notifications(member_id,recipient_email,recipient_user_id,kind,title,body,action_href,portal_visible,deduplication_key)
 values(m.id,m.contact_email,m.auth_user_id,'membership.renewal-invitation',
  'Your new YDSME '||p_year||' renewal link',
  concat_ws(E'\n\n',
   m.full_name||'''s membership of the Society has lapsed. The membership officer has sent you a new personal link so you can renew for '||p_year||' and come back.',
   public.membership_renewal_fee_text(m.id,p_year),
   public.membership_renewal_payment_text(m.id,p_year)),
  '/membership/renew?token='||p_token,false,
  'renewal-link-'||m.id||'-'||p_year||'-'||replace(gen_random_uuid()::text,'-',''));
 insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
 values(p_actor,'committee','membership.renewal-link-reissued','member',m.id::text,
  'New renewal link sent to a lapsed member.',
  jsonb_build_object('year',p_year,'expires_at',v_expires));
 return v_expires;
end $$;
revoke all on function public.reissue_membership_renewal_link(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reissue_membership_renewal_link(uuid,integer,uuid,text,text) to service_role;

-- The lapsed notice says what happens next. There is no account to open, so it has no button.
create or replace function public.notify_membership_state_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    v_body:='The renewal grace period has ended, so your membership has lapsed and your account is closed. To come back, please contact the membership officer, who will send you a new renewal link. If you renew part-way through the year you pay a part-year fee, the same as a new member.';
  elsif new.effective_state='active' and old.effective_state in ('grace','lapsed','payment_review') then
    v_kind:='membership.reinstated'; v_title:='Your membership is active again';
    v_body:='Your paid membership and account access have been reinstated.';
  else return new;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    new.id,new.auth_user_id,new.contact_email,v_kind,v_title,v_body,
    case when new.effective_state='lapsed' then null else '/account' end,
    'membership-state-' || new.id::text || '-' || new.effective_state || '-' || current_date::text
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$function$;

-- The two ways a renewal is recorded expect the same fee the member was quoted.
-- Offline (officer records cash, cheque or bank transfer): the part-year fee, from the date the money was received.
create or replace function public.activate_offline_membership_renewal(p_member_id uuid, p_plan_price_id uuid, p_membership_year integer, p_method text, p_amount_pence integer, p_received_on date, p_payment_reference text, p_actor_id uuid)
 RETURNS TABLE(member_id uuid, term_id uuid, payment_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    else public.membership_returning_member_fee_pence(p_member_id,p_membership_year,v_price.amount_pence,p_received_on) end;
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
$function$;

-- Card (Stripe webhook).
create or replace function public.activate_membership_renewal(p_member_id uuid, p_plan_price_id uuid, p_membership_year integer, p_method text, p_amount_pence integer, p_paid_on date, p_actor_id uuid DEFAULT NULL::uuid, p_cash_receipt_reference text DEFAULT NULL::text, p_stripe_checkout_session_id text DEFAULT NULL::text, p_stripe_payment_intent_id text DEFAULT NULL::text, p_stripe_invoice_id text DEFAULT NULL::text, p_stripe_customer_id text DEFAULT NULL::text, p_stripe_subscription_id text DEFAULT NULL::text, p_stripe_subscription_status text DEFAULT NULL::text, p_cancel_at_period_end boolean DEFAULT false, p_current_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_stripe_event_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(member_id uuid, term_id uuid, payment_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_member public.members%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_term_id uuid;
  v_payment_id uuid;
  v_today date := (pg_catalog.now() at time zone 'Europe/London')::date;
  v_honorary public.honorary_memberships%rowtype;
  v_expected integer;
  v_starts_on date;
  v_quote_date date;
  v_returning integer;
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
  -- A lapsed member pays the part-year fee for the month the checkout was created (the amount Stripe was
  -- asked to charge), not the month the webhook arrives, so a payment across midnight on the last day of a
  -- month is not refused. The full fee is always accepted as well (a member still in grace when they paid).
  v_quote_date:=coalesce((select (attempt.created_at at time zone 'Europe/London')::date
    from public.membership_checkout_attempts attempt
    where attempt.stripe_checkout_session_id=p_stripe_checkout_session_id and attempt.member_id=p_member_id),v_today);
  v_returning:=case when v_honorary.id is null
    then public.membership_returning_member_fee_pence(p_member_id,p_membership_year,v_price.amount_pence,v_quote_date)
    else v_expected end;
  if p_amount_pence not in (v_expected,v_returning) then raise exception 'membership_renewal_amount_invalid'; end if;

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
$function$;

