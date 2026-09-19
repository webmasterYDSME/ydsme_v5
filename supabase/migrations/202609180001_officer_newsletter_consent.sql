-- Record newsletter consent for members an officer adds.
--
-- The website already stores newsletter_opt_in. For officer-added members the
-- officer is attesting to consent given on paper, in person or by phone, so the
-- record keeps how and when consent was given, when it was entered and who
-- entered it. Existing members are left untouched: no consent record is
-- invented for them.

alter table public.members
  add column if not exists newsletter_consent_source text
    check (newsletter_consent_source is null or newsletter_consent_source in ('paper_form','in_person','phone')),
  add column if not exists newsletter_consent_given_on date,
  add column if not exists newsletter_consent_recorded_at timestamptz,
  add column if not exists newsletter_consent_recorded_by_actor_id uuid
    references public.administrative_actors(id) on delete set null;

alter table public.members
  add constraint members_newsletter_consent_record_check check (
    (newsletter_consent_source is null and newsletter_consent_given_on is null and newsletter_consent_recorded_at is null)
    or (newsletter_consent_source is not null and newsletter_consent_given_on is not null and newsletter_consent_recorded_at is not null)
  );

-- A new signature with new defaulted parameters would sit beside the old one and make
-- named-argument calls ambiguous, so the old function is replaced.
drop function public.create_officer_managed_membership(uuid,text,date,text,boolean,text,date,uuid,text,text,text,jsonb,boolean,text,text,text,text);

create function public.create_officer_managed_membership(
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
  p_duplicate_override_reason text default null,
  p_newsletter_opt_in boolean default false,
  p_newsletter_consent_source text default null,
  p_newsletter_consent_given_on date default null
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
  v_newsletter boolean := coalesce(p_newsletter_opt_in,false);
  v_consent_on date;
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
  if v_newsletter then
    if nullif(btrim(p_contact_email),'') is null then raise exception 'membership_newsletter_email_required'; end if;
    if p_newsletter_consent_source is null or p_newsletter_consent_source not in ('paper_form','in_person','phone') then
      raise exception 'membership_newsletter_consent_evidence_required';
    end if;
    v_consent_on := coalesce(p_newsletter_consent_given_on,current_date);
    if v_consent_on > current_date then raise exception 'membership_newsletter_consent_date_invalid'; end if;
  end if;
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
    postal_address,preferred_contact_method,newsletter_opt_in,newsletter_consent_source,
    newsletter_consent_given_on,newsletter_consent_recorded_at,newsletter_consent_recorded_by_actor_id
  ) values (
    left(coalesce(btrim(p_title),''),30),btrim(p_full_name),nullif(lower(btrim(p_contact_email)),''),
    nullif(btrim(p_contact_number),''),p_date_of_birth,nullif(btrim(p_guardian_name),''),
    nullif(lower(btrim(p_guardian_email)),''),case when v_plan.slug='junior' then now() else null end,
    nullif(btrim(p_guardian_consent_note),''),p_plan_id,case when p_payment_received then 'active' else 'lapsed' end,
    coalesce(p_received_on,current_date),'officer',p_postal_address,
    case when nullif(btrim(p_contact_email),'') is not null then 'email'
      when nullif(btrim(p_contact_number),'') is not null then 'telephone'
      when p_postal_address is not null then 'post' else 'officer' end,
    v_newsletter,case when v_newsletter then p_newsletter_consent_source else null end,
    case when v_newsletter then v_consent_on else null end,case when v_newsletter then now() else null end,
    case when v_newsletter then v_actor else null end
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
      'duplicate_override_reason',nullif(btrim(p_duplicate_override_reason),''),
      'newsletter_opt_in',v_newsletter,
      'newsletter_consent_source',case when v_newsletter then p_newsletter_consent_source else null end,
      'newsletter_consent_given_on',case when v_newsletter then v_consent_on else null end
    ));
  return query select v_member_id,v_term_id,v_payment_id;
end;
$$;

revoke all on function public.create_officer_managed_membership(uuid,text,date,text,boolean,text,date,uuid,text,text,text,jsonb,boolean,text,text,text,text,boolean,text,date)
  from public,anon,authenticated;
grant execute on function public.create_officer_managed_membership(uuid,text,date,text,boolean,text,date,uuid,text,text,text,jsonb,boolean,text,text,text,text,boolean,text,date)
  to service_role;
