-- Output-column names in a RETURNS TABLE function are PL/pgSQL variables.
-- Qualify member_id predicates so pending officer-created terms can activate.

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
  v_expected integer;
  v_actor uuid;
  v_settings uuid;
begin
  if not public.has_membership_management_capability(p_actor_id) or p_method not in ('cash','bank_transfer','cheque')
    or nullif(btrim(p_payment_reference),'') is null or p_received_on is null then
    raise exception 'membership_offline_renewal_invalid';
  end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found or v_member.effective_state in ('suspended','archived','honorary') then raise exception 'membership_renewal_member_unavailable'; end if;
  select * into v_price from public.membership_plan_prices where id=p_plan_price_id
    and plan_id=v_member.current_plan_id and membership_year=p_membership_year and active;
  if not found then raise exception 'membership_renewal_price_unavailable'; end if;
  if p_membership_year < extract(year from p_received_on)::integer or p_membership_year > extract(year from p_received_on)::integer+1 then
    raise exception 'membership_renewal_year_invalid';
  end if;
  v_expected := case when p_membership_year>extract(year from p_received_on)::integer then v_price.amount_pence
    else public.prorated_membership_fee_pence(v_price.amount_pence,p_received_on) end;
  if p_amount_pence<>v_expected then raise exception 'membership_renewal_amount_invalid'; end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select id into v_settings from public.membership_payment_settings_versions where active;
  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,
    amount_due_pence,amount_paid_pence,source,expected_payment_method,created_by_actor_id
  ) values (
    p_member_id,p_plan_price_id,p_membership_year,make_date(p_membership_year,1,1),make_date(p_membership_year,12,31),
    make_date(p_membership_year+1,3,1),'paid',p_amount_pence,p_amount_pence,'renewal',p_method,v_actor
  ) on conflict on constraint membership_terms_member_id_membership_year_key do update set
    plan_price_id=excluded.plan_price_id,status='paid',amount_due_pence=excluded.amount_due_pence,
    amount_paid_pence=excluded.amount_paid_pence,source='renewal',expected_payment_method=excluded.expected_payment_method,
    created_by_actor_id=excluded.created_by_actor_id,updated_at=now()
  where public.membership_terms.status in ('scheduled','grace','lapsed') and public.membership_terms.amount_paid_pence=0
  returning id into v_term_id;
  if v_term_id is null then raise exception 'membership_renewal_already_paid'; end if;
  insert into public.membership_payments(
    term_id,method,status,amount_pence,offline_reference,received_by,received_at,recorded_by_actor_id,cleared_at,cash_receipt_reference
  ) values (
    v_term_id,p_method,'paid',p_amount_pence,btrim(p_payment_reference),p_actor_id,p_received_on::timestamptz,
    v_actor,now(),case when p_method='cash' then btrim(p_payment_reference) else null end
  ) returning id into v_payment_id;
  insert into public.membership_offline_payment_records(
    member_id,term_id,method,status,expected_amount_pence,payment_reference,received_on,cleared_on,settings_version_id,recorded_by_actor_id
  ) values(p_member_id,v_term_id,p_method,'cleared',p_amount_pence,btrim(p_payment_reference),p_received_on,current_date,v_settings,v_actor);
  update public.membership_subscriptions subscription
    set cancel_at_period_end=true,next_charge_at=null,updated_at=now()
    where subscription.member_id=p_member_id;
  if v_member.effective_state not in ('suspended','archived') then
    update public.members set effective_state='active',updated_at=now() where id=p_member_id;
    update public.users set membership_status='active',updated_at=now() where id=v_member.auth_user_id and membership_status='lapsed';
  end if;
  update public.membership_notifications notification set email_status='cancelled',updated_at=now()
    where notification.member_id=p_member_id and notification.email_status in ('queued','failed')
      and notification.kind in ('membership.renewal-upcoming','membership.renewal-overdue');
  if v_member.contact_email is not null then
    insert into public.membership_notifications(member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key)
    values(p_member_id,v_member.auth_user_id,v_member.contact_email,'membership.renewal-paid','Your membership renewal is paid',
      format('Your %s membership term is active. Payment of £%s was received by %s.',p_membership_year,
        trim(to_char(p_amount_pence/100.0,'FM999999990.00')),replace(p_method,'_',' ')),
      '/account','membership-renewal-paid-'||v_payment_id::text);
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.renewal-paid','membership_term',v_term_id::text,
    'Membership renewal paid in full.',jsonb_build_object('member_id',p_member_id,'year',p_membership_year,'method',p_method,'amount_pence',p_amount_pence));
  return query select p_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.activate_offline_membership_renewal(uuid,uuid,integer,text,integer,date,text,uuid) from public,anon,authenticated;
grant execute on function public.activate_offline_membership_renewal(uuid,uuid,integer,text,integer,date,text,uuid) to service_role;
