-- Atomic officer-created membership and offline payment reconciliation.

create or replace function public.replace_membership_payment_settings(
  p_actor_id uuid,
  p_treasurer_name text,
  p_treasurer_email text,
  p_treasurer_phone text,
  p_bank_account_name text,
  p_bank_sort_code text,
  p_bank_account_number text,
  p_bank_transfer_instructions text,
  p_cheque_payee text,
  p_cheque_delivery_instructions text,
  p_cash_instructions text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_actor uuid;
begin
  if not exists(
    select 1 from public.users u join public.user_roles r on r.user_id=u.id
    where u.id=p_actor_id and u.membership_status='active' and r.role='administrator'
  ) then raise exception 'membership_payment_settings_forbidden'; end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select coalesce(max(version),0)+1 into v_version from public.membership_payment_settings_versions;
  update public.membership_payment_settings_versions set active=false where active;
  insert into public.membership_payment_settings_versions(
    version,active,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,
    bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,
    cheque_delivery_instructions,cash_instructions,created_by_actor_id
  ) values (
    v_version,true,btrim(p_treasurer_name),lower(btrim(p_treasurer_email)),nullif(btrim(p_treasurer_phone),''),
    btrim(p_bank_account_name),btrim(p_bank_sort_code),btrim(p_bank_account_number),
    btrim(p_bank_transfer_instructions),btrim(p_cheque_payee),btrim(p_cheque_delivery_instructions),
    btrim(p_cash_instructions),v_actor
  ) returning id into v_id;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'administrator','membership.payment-settings-updated','membership_payment_settings',v_id::text,
    'Membership payment and Treasurer instructions updated.',jsonb_build_object('version',v_version));
  return v_id;
end;
$$;

revoke all on function public.replace_membership_payment_settings(uuid,text,text,text,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.replace_membership_payment_settings(uuid,text,text,text,text,text,text,text,text,text,text)
  to service_role;

create or replace function public.create_officer_managed_membership(
  p_plan_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_payment_method text,
  p_payment_received boolean,
  p_payment_reference text,
  p_received_on date,
  p_actor_id uuid,
  p_title text default '',
  p_contact_email text default null,
  p_contact_number text default null,
  p_postal_address jsonb default null,
  p_student_declaration boolean default false,
  p_guardian_name text default null,
  p_guardian_email text default null,
  p_guardian_consent_note text default null,
  p_duplicate_override_reason text default null
)
returns table(member_id uuid,term_id uuid,payment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.membership_plans%rowtype;
  v_price public.membership_plan_prices%rowtype;
  v_year integer;
  v_age integer;
  v_amount integer;
  v_member_id uuid;
  v_term_id uuid;
  v_payment_id uuid;
  v_actor uuid;
  v_settings uuid;
  v_reference text;
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'membership_officer_create_forbidden'; end if;
  if p_payment_method not in ('cash','bank_transfer','cheque') then raise exception 'membership_officer_payment_method_invalid'; end if;
  if nullif(btrim(p_full_name),'') is null or p_date_of_birth is null then raise exception 'membership_officer_identity_invalid'; end if;
  if p_payment_received and (nullif(btrim(p_payment_reference),'') is null or p_received_on is null) then
    raise exception 'membership_officer_payment_evidence_required';
  end if;
  select * into v_plan from public.membership_plans where id=p_plan_id and active;
  if not found then raise exception 'membership_plan_unavailable'; end if;
  v_age := extract(year from age(coalesce(p_received_on,current_date),p_date_of_birth))::integer;
  if v_age < v_plan.minimum_age or v_age > v_plan.maximum_age then raise exception 'membership_plan_age_mismatch'; end if;
  if v_plan.slug='student' and not p_student_declaration then raise exception 'membership_student_declaration_required'; end if;
  if v_plan.slug='junior' and (
    nullif(btrim(p_guardian_name),'') is null or nullif(btrim(p_guardian_consent_note),'') is null
  ) then raise exception 'membership_guardian_consent_required'; end if;
  if exists(
    select 1 from public.members m where m.effective_state<>'archived' and (
      (p_contact_email is not null and lower(m.contact_email)=lower(btrim(p_contact_email)))
      or (lower(m.full_name)=lower(btrim(p_full_name)) and m.date_of_birth=p_date_of_birth)
    )
  ) and char_length(coalesce(btrim(p_duplicate_override_reason),''))<5 then
    raise exception 'membership_possible_duplicate';
  end if;
  v_year := public.membership_billing_year(coalesce(p_received_on,current_date));
  select * into v_price from public.membership_plan_prices
  where plan_id=p_plan_id and membership_year=v_year and active order by version desc limit 1;
  if not found then raise exception 'membership_price_unavailable'; end if;
  v_amount := public.prorated_membership_fee_pence(v_price.amount_pence,coalesce(p_received_on,current_date));
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select id into v_settings from public.membership_payment_settings_versions where active;
  v_reference := coalesce(nullif(btrim(p_payment_reference),''),'Pending '||replace(gen_random_uuid()::text,'-',''));

  insert into public.members(
    title,full_name,contact_email,contact_number,date_of_birth,guardian_name,guardian_email,
    guardian_consent_at,guardian_consent_note,current_plan_id,effective_state,joined_on,source,
    postal_address,preferred_contact_method
  ) values (
    left(coalesce(btrim(p_title),''),30),btrim(p_full_name),nullif(lower(btrim(p_contact_email)),''),
    nullif(btrim(p_contact_number),''),p_date_of_birth,nullif(btrim(p_guardian_name),''),
    nullif(lower(btrim(p_guardian_email)),''),case when v_plan.slug='junior' then now() else null end,
    nullif(btrim(p_guardian_consent_note),''),p_plan_id,case when p_payment_received then 'active' else 'lapsed' end,
    coalesce(p_received_on,current_date),'officer',p_postal_address,
    case when nullif(btrim(p_contact_email),'') is not null then 'email'
      when nullif(btrim(p_contact_number),'') is not null then 'telephone'
      when p_postal_address is not null then 'post' else 'officer' end
  ) returning id into v_member_id;

  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,
    amount_due_pence,amount_paid_pence,source,expected_payment_method,created_by_actor_id
  ) values (
    v_member_id,v_price.id,v_year,make_date(v_year,1,1),make_date(v_year,12,31),make_date(v_year+1,3,1),
    case when p_payment_received then 'paid' else 'scheduled' end,v_amount,
    case when p_payment_received then v_amount else 0 end,'officer',p_payment_method,v_actor
  ) returning id into v_term_id;

  insert into public.membership_offline_payment_records(
    member_id,term_id,method,status,expected_amount_pence,payment_reference,received_on,cleared_on,
    settings_version_id,recorded_by_actor_id
  ) values (
    v_member_id,v_term_id,p_payment_method,case when p_payment_received then 'cleared' else 'awaiting' end,
    v_amount,case when p_payment_received then v_reference else null end,
    case when p_payment_received then p_received_on else null end,
    case when p_payment_received then p_received_on else null end,v_settings,
    case when p_payment_received then v_actor else null end
  );

  if p_payment_received then
    insert into public.membership_payments(
      term_id,method,status,amount_pence,offline_reference,received_by,received_at,recorded_by_actor_id,cleared_at,
      cash_receipt_reference
    ) values (
      v_term_id,p_payment_method,'paid',v_amount,v_reference,p_actor_id,p_received_on::timestamptz,v_actor,
      p_received_on::timestamptz,case when p_payment_method='cash' then v_reference else null end
    ) returning id into v_payment_id;
  end if;

  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.officer-created','member',v_member_id::text,
    'Officer-created membership recorded.',jsonb_build_object(
      'term_year',v_year,'method',p_payment_method,'payment_received',p_payment_received,
      'duplicate_override_reason',nullif(btrim(p_duplicate_override_reason),'')
    ));
  return query select v_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.create_officer_managed_membership(uuid,text,date,text,boolean,text,date,uuid,text,text,text,jsonb,boolean,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_officer_managed_membership(uuid,text,date,text,boolean,text,date,uuid,text,text,text,jsonb,boolean,text,text,text,text)
  to service_role;

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
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'membership_offline_record_forbidden'; end if;
  if p_event not in ('received','failed') then raise exception 'membership_offline_event_invalid'; end if;
  select * into v_application from public.membership_applications where id=p_application_id for update;
  if not found or v_application.payment_method not in ('cash','bank_transfer','cheque')
    or v_application.status <> (case v_application.payment_method
      when 'cash' then 'awaiting_cash' when 'bank_transfer' then 'awaiting_bank_transfer' else 'awaiting_cheque' end)
  then raise exception 'membership_offline_application_unavailable'; end if;
  select * into v_price from public.membership_plan_prices
    where plan_id=v_application.requested_plan_id
      and membership_year=public.membership_billing_year(v_application.created_at::date) and active
    order by version desc limit 1;
  if not found then raise exception 'membership_price_unavailable'; end if;
  v_expected := public.prorated_membership_fee_pence(v_price.amount_pence,v_application.created_at::date);
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select * into v_record from public.membership_offline_payment_records
    where application_id=p_application_id and status in ('awaiting','received') for update;
  if p_event='received' and (nullif(btrim(p_payment_reference),'') is null or p_received_on is null) then
    raise exception 'membership_offline_evidence_required';
  end if;
  if p_event='failed' and char_length(coalesce(btrim(p_reason),''))<5 then raise exception 'membership_offline_failure_reason_required'; end if;
  if found then
    update public.membership_offline_payment_records set
      status=p_event,payment_reference=case when p_event='received' then btrim(p_payment_reference) else payment_reference end,
      received_on=case when p_event='received' then p_received_on else received_on end,
      failure_reason=case when p_event='failed' then btrim(p_reason) else null end,
      recorded_by_actor_id=v_actor,updated_at=now()
    where id=v_record.id returning id into v_record.id;
  else
    insert into public.membership_offline_payment_records(
      application_id,method,status,expected_amount_pence,payment_reference,received_on,failure_reason,
      settings_version_id,recorded_by_actor_id
    ) values (
      p_application_id,v_application.payment_method,p_event,v_expected,
      case when p_event='received' then btrim(p_payment_reference) else null end,
      case when p_event='received' then p_received_on else null end,
      case when p_event='failed' then btrim(p_reason) else null end,
      v_application.payment_settings_version_id,v_actor
    ) returning id into v_record.id;
  end if;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.offline-payment-'||p_event,'membership_application',p_application_id::text,
    'Offline membership payment reconciliation updated.',jsonb_build_object('method',v_application.payment_method,'event',p_event));
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
begin
  if not public.has_membership_management_capability(p_actor_id)
    or nullif(btrim(p_payment_reference),'') is null or p_received_on is null then
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
  select * into v_price from public.membership_plan_prices where id=p_plan_price_id
    and plan_id=v_application.requested_plan_id and active;
  if not found then raise exception 'membership_price_unavailable'; end if;
  select * into v_plan from public.membership_plans where id=v_price.plan_id;
  v_year := public.membership_billing_year(v_application.created_at::date);
  v_expected := public.prorated_membership_fee_pence(v_price.amount_pence,v_application.created_at::date);
  if v_price.membership_year<>v_year or p_amount_pence<>v_expected then raise exception 'membership_payment_amount_invalid'; end if;
  if exists(select 1 from public.members m where lower(m.contact_email)=lower(v_application.contact_email) and m.effective_state<>'archived') then
    raise exception 'membership_identity_already_exists';
  end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  insert into public.members(
    title,full_name,contact_email,contact_number,date_of_birth,guardian_name,guardian_email,
    guardian_consent_at,current_plan_id,effective_state,joined_on,source
  ) values (
    v_application.title,v_application.full_name,lower(v_application.contact_email),v_application.contact_number,
    v_application.date_of_birth,v_application.guardian_name,lower(v_application.guardian_email),
    v_application.guardian_verified_at,v_application.requested_plan_id,'active',current_date,'website'
  ) returning id into v_member_id;
  insert into public.membership_terms(
    member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,
    amount_due_pence,amount_paid_pence,source,application_id,expected_payment_method,created_by_actor_id
  ) values (
    v_member_id,p_plan_price_id,v_year,make_date(v_year,1,1),make_date(v_year,12,31),make_date(v_year+1,3,1),
    'paid',p_amount_pence,p_amount_pence,'application',v_application.id,v_application.payment_method,v_actor
  ) returning id into v_term_id;
  insert into public.membership_payments(
    term_id,method,status,amount_pence,offline_reference,received_by,received_at,recorded_by_actor_id,cleared_at,cash_receipt_reference
  ) values (
    v_term_id,v_application.payment_method,'paid',p_amount_pence,btrim(p_payment_reference),p_actor_id,
    p_received_on::timestamptz,v_actor,now(),case when v_application.payment_method='cash' then btrim(p_payment_reference) else null end
  ) returning id into v_payment_id;
  update public.membership_offline_payment_records set status='cleared',member_id=v_member_id,term_id=v_term_id,
    payment_reference=btrim(p_payment_reference),received_on=coalesce(received_on,p_received_on),cleared_on=current_date,
    recorded_by_actor_id=v_actor,updated_at=now()
  where application_id=v_application.id and status in ('awaiting','received');
  if not found then
    insert into public.membership_offline_payment_records(
      application_id,member_id,term_id,method,status,expected_amount_pence,payment_reference,received_on,cleared_on,
      settings_version_id,recorded_by_actor_id
    ) values (
      v_application.id,v_member_id,v_term_id,v_application.payment_method,'cleared',p_amount_pence,
      btrim(p_payment_reference),p_received_on,current_date,v_application.payment_settings_version_id,v_actor
    );
  end if;
  update public.membership_applications set status='converted',converted_member_id=v_member_id,updated_at=now()
    where id=v_application.id;
  insert into public.membership_notifications(member_id,recipient_email,kind,title,body,portal_visible,deduplication_key)
  values(v_member_id,lower(v_application.contact_email),'membership.activated','Your Society membership is active',
    format('Your %s membership for %s is active. Payment by %s has been confirmed.',v_plan.name,v_year,replace(v_application.payment_method,'_',' ')),
    false,'membership-activated-'||v_member_id::text||'-'||v_year::text);
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'committee','membership.activated','member',v_member_id::text,
    'Membership activated by confirmed offline payment.',jsonb_build_object('term_year',v_year,'method',v_application.payment_method,'amount_pence',p_amount_pence));
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
  update public.membership_subscriptions set cancel_at_period_end=true,next_charge_at=null,updated_at=now() where member_id=p_member_id;
  if v_member.effective_state not in ('suspended','archived') then
    update public.members set effective_state='active',updated_at=now() where id=p_member_id;
    update public.users set membership_status='active',updated_at=now() where id=v_member.auth_user_id and membership_status='lapsed';
  end if;
  update public.membership_notifications set email_status='cancelled',updated_at=now()
    where member_id=p_member_id and email_status in ('queued','failed')
      and kind in ('membership.renewal-upcoming','membership.renewal-overdue');
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
