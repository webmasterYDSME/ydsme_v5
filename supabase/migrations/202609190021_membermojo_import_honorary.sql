-- Life (Honorary) and Associate Volunteer people become lifetime honorary members: no fee, no paid term,
-- no renewal emails. Before this they were imported as Adult members with the Adult fee recorded as paid.
-- If such a person already has a record, the import leaves it alone and says so; an officer can grant
-- honorary membership on that record.

create or replace function public.membermojo_import_plan(p_rows jsonb, p_year integer)
returns table (
  row_no integer,
  full_name text,
  email text,
  membership_type text,
  plan_slug text,
  plan_flag text,
  member_id uuid,
  member_state text,
  shared_email boolean,
  login_user_id uuid,
  action text,
  note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select (ordinality)::integer as row_no,
      regexp_replace(btrim(coalesce(item->>'full_name', '')), '\s+', ' ', 'g') as full_name,
      nullif(lower(btrim(coalesce(item->>'email', ''))), '') as email,
      btrim(coalesce(item->>'membership_type', '')) as membership_type
    from jsonb_array_elements(p_rows) with ordinality as t(item, ordinality)
  ), typed as (
    select i.*,
      case
        when lower(i.membership_type) like '%junior%' then 'junior'
        when lower(i.membership_type) like '%student%' then 'student'
        when lower(i.membership_type) ~ '(concession|senior|over 80)' then 'concession'
        else 'adult'
      end as plan_slug,
      case
        when lower(i.membership_type) ~ '(honor|life|volunteer)' then 'honorary'
        when lower(i.membership_type) ~ '(junior|student|concession|senior|over 80|adult)' then null
        else 'unrecognised'
      end as plan_flag,
      row_number() over (partition by coalesce(i.email, ''), lower(i.full_name) order by i.row_no) as occurrence,
      (i.email is not null and lower(i.membership_type) not like '%junior%'
        and (select count(distinct lower(other.full_name)) from input other
          where other.email = i.email and lower(other.membership_type) not like '%junior%') > 1) as shared_in_file
    from input i
  ), matched as (
    select t.*,
      (select m.id from public.members m
        where m.anonymized_at is null
          and lower(regexp_replace(btrim(m.full_name), '\s+', ' ', 'g')) = lower(t.full_name)
          and lower(coalesce(m.contact_email, '')) = coalesce(t.email, '')
        order by m.created_at limit 1) as existing_id
    from typed t
  ), described as (
    select m.*,
      (select mm.effective_state from public.members mm where mm.id = m.existing_id) as existing_state,
      (m.shared_in_file or (m.email is not null and m.plan_slug <> 'junior' and exists (
        select 1 from public.members other
        left join public.membership_plans other_plan on other_plan.id = other.current_plan_id
        where other.anonymized_at is null and lower(coalesce(other.contact_email, '')) = m.email
          and other_plan.slug is distinct from 'junior'
          and other.id is distinct from m.existing_id
          and lower(regexp_replace(btrim(other.full_name), '\s+', ' ', 'g')) <> lower(m.full_name)))) as shared,
      (select mm.auth_user_id from public.members mm where mm.id = m.existing_id) as existing_login,
      (select u.id from public.users u
        where m.email is not null and lower(u.email) = m.email
          and (select count(*) from public.users u2 where lower(u2.email) = m.email) = 1
          and not exists (select 1 from public.members linked
            where linked.auth_user_id = u.id and linked.id is distinct from m.existing_id)) as email_login,
      exists (select 1 from public.membership_terms t
        where t.member_id = m.existing_id and t.membership_year = p_year
          and (t.status = 'paid' or t.amount_paid_pence > 0)) as paid_this_year,
      exists (select 1 from public.membership_terms t
        where t.member_id = m.existing_id and t.membership_year = p_year and t.status = 'payment_review') as term_under_review
    from matched m
  )
  select d.row_no, d.full_name, d.email, d.membership_type, d.plan_slug, d.plan_flag,
    d.existing_id, d.existing_state, d.shared,
    case when d.plan_slug = 'junior' or d.shared then d.existing_login else coalesce(d.existing_login, d.email_login) end,
    case
      when d.occurrence > 1 then 'skip'
      when char_length(d.full_name) < 2 then 'skip'
      when d.email is not null and d.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'skip'
      when d.existing_id is null then 'add'
      when d.plan_flag = 'honorary' then 'skip'
      when d.existing_state in ('archived', 'suspended', 'payment_review', 'honorary') or d.term_under_review then 'skip'
      when d.paid_this_year then 'already_paid'
      else 'renew'
    end,
    case
      when d.occurrence > 1 then 'Listed more than once in the file'
      when char_length(d.full_name) < 2 then 'No name'
      when d.email is not null and d.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'The email address does not look right'
      when d.existing_state = 'archived' then 'Archived: left as it is'
      when d.existing_state = 'suspended' then 'Suspended: left as it is'
      when d.existing_state = 'honorary' then 'Already an honorary member'
      when d.existing_state = 'payment_review' or d.term_under_review then 'A payment is being checked: left as it is'
      when d.plan_flag = 'honorary' then 'Honorary in MemberMojo: an officer can grant honorary membership on their record'
      else null
    end
  from described d
  order by d.row_no;
$$;

create or replace function public.apply_membermojo_import(
  p_actor_id uuid,
  p_rows jsonb,
  p_year integer,
  p_file_sha256 text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row record;
  v_started timestamptz := now();
  v_plan uuid;
  v_price public.membership_plan_prices%rowtype;
  v_member uuid;
  v_login uuid;
  v_touched uuid[] := '{}';
  v_added integer := 0;
  v_renewed integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
  v_linked integer := 0;
  v_needs_invitation integer := 0;
  v_filled integer := 0;
  v_honorary integer := 0;
  v_item jsonb;
  v_title text;
  v_phone text;
  v_dob date;
  v_address jsonb;
  v_line_one text;
  v_city text;
  v_postcode text;
begin
  if not public.has_membership_management_capability(p_actor_id) then
    raise exception 'membermojo_import_actor_invalid';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000
    or p_year is null or p_year not between 2026 and 2200
    or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'membermojo_import_invalid';
  end if;

  for v_row in select * from public.membermojo_import_plan(p_rows, p_year) order by row_no loop
    if v_row.action = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- The extra details for this row, exactly as they were in the file.
    v_item := p_rows -> (v_row.row_no - 1);
    v_title := left(btrim(coalesce(v_item->>'title', '')), 30);
    v_phone := nullif(left(btrim(coalesce(v_item->>'contact_number', '')), 40), '');
    begin
      v_dob := nullif(btrim(coalesce(v_item->>'date_of_birth', '')), '')::date;
    exception when others then
      v_dob := null;
    end;
    if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
    v_line_one := nullif(left(btrim(coalesce(v_item->>'address_line_one', '')), 180), '');
    v_city := nullif(left(btrim(coalesce(v_item->>'city', '')), 180), '');
    v_postcode := nullif(left(btrim(coalesce(v_item->>'postcode', '')), 12), '');
    v_address := case when v_line_one is null and v_city is null and v_postcode is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'address_line_one', v_line_one,
        'address_line_two', nullif(left(btrim(coalesce(v_item->>'address_line_two', '')), 180), ''),
        'city', v_city, 'postcode', v_postcode, 'country', 'United Kingdom')) end;

    select id into v_plan from public.membership_plans where slug = v_row.plan_slug;
    select * into v_price from public.membership_plan_prices
      where plan_id = v_plan and active and membership_year <= p_year
      order by membership_year desc, version desc limit 1;
    if v_plan is null or v_price.id is null then
      raise exception 'membermojo_import_price_missing';
    end if;

    v_login := v_row.login_user_id;
    if v_row.action = 'add' then
      insert into public.members(
        auth_user_id, full_name, contact_email, current_plan_id, effective_state, joined_on, source,
        contact_role, portal_invitation_status, preferred_contact_method,
        title, contact_number, date_of_birth, postal_address
      ) values (
        v_login, v_row.full_name, v_row.email, v_plan, 'active', current_date, 'membermojo_cutover',
        case when v_row.plan_slug = 'junior' then 'guardian' when v_row.shared_email then 'shared_household' else 'self' end,
        case
          when v_row.plan_slug = 'junior' or v_row.email is null then 'not_requested'
          when v_row.shared_email then 'blocked_shared'
          when v_login is not null then 'linked'
          else 'eligible' end,
        case when v_row.email is not null then 'email' when v_phone is not null then 'telephone'
          when v_address is not null then 'post' else 'officer' end,
        v_title, v_phone, v_dob, v_address
      ) returning id into v_member;
      v_added := v_added + 1;
      if v_row.plan_flag = 'honorary' then
        -- Life (Honorary) and Associate Volunteer: lifetime honorary membership, so no fee and no term.
        perform public.grant_lifetime_honorary_membership(
          v_member, current_date, left(format('%s member in MemberMojo (imported)', v_row.membership_type), 500), p_actor_id);
        v_honorary := v_honorary + 1;
      end if;
    else
      v_member := v_row.member_id;
      -- An existing record is never overwritten: only details it does not have yet are filled in.
      update public.members set
        title = case when title = '' then v_title else title end,
        contact_number = coalesce(nullif(btrim(contact_number), ''), v_phone),
        date_of_birth = coalesce(date_of_birth, v_dob),
        postal_address = coalesce(postal_address, v_address),
        updated_at = now()
      where id = v_member
        and ((title = '' and v_title <> '') or (nullif(btrim(contact_number), '') is null and v_phone is not null)
          or (date_of_birth is null and v_dob is not null) or (postal_address is null and v_address is not null));
      if found then v_filled := v_filled + 1; end if;
      if v_row.action = 'renew' then
        update public.members set effective_state = 'active', updated_at = now()
          where id = v_member and effective_state <> 'active';
        v_renewed := v_renewed + 1;
      else
        v_already := v_already + 1;
      end if;
      if v_login is not null and not exists (select 1 from public.members where id = v_member and auth_user_id = v_login) then
        update public.members set auth_user_id = v_login, portal_invitation_status = 'linked', updated_at = now()
          where id = v_member and auth_user_id is null;
      end if;
    end if;
    if v_login is not null then v_linked := v_linked + 1;
    elsif v_row.email is not null and v_row.plan_slug <> 'junior' and not v_row.shared_email then v_needs_invitation := v_needs_invitation + 1;
    end if;

    if v_row.action in ('add', 'renew') and v_row.plan_flag is distinct from 'honorary' then
      if exists (select 1 from public.membership_terms where member_id = v_member and membership_year = p_year) then
        update public.membership_terms
          set status = 'paid', amount_paid_pence = amount_due_pence, updated_at = now()
          where member_id = v_member and membership_year = p_year and status <> 'paid';
      else
        insert into public.membership_terms(
          member_id, plan_price_id, membership_year, starts_on, ends_on, grace_ends_on,
          status, amount_due_pence, amount_paid_pence, source
        ) values (
          v_member, v_price.id, p_year, make_date(p_year, 1, 1), make_date(p_year, 12, 31), make_date(p_year + 1, 3, 1),
          'paid', v_price.amount_pence, v_price.amount_pence, 'membermojo_cutover'
        );
      end if;
      v_touched := v_touched || v_member;
    elsif v_row.action = 'add' then
      v_touched := v_touched || v_member;
    end if;

  end loop;

  -- Changing a member's state queues "your membership is active again" style emails. The import
  -- tells nobody, so those are cancelled for everyone it touched.
  update public.membership_notifications
    set email_status = 'cancelled', updated_at = now()
    where member_id = any(v_touched) and created_at >= v_started and email_status in ('queued', 'failed')
      and kind not like '%-officer';

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values (p_actor_id, 'administrator', 'membermojo.list-imported', 'member-import', gen_random_uuid()::text,
    format('MemberMojo list imported for %s: %s added, %s renewed, %s already paid, %s skipped.', p_year, v_added, v_renewed, v_already, v_skipped),
    jsonb_build_object('file_fingerprint', left(p_file_sha256, 12), 'year', p_year, 'rows', jsonb_array_length(p_rows),
      'added', v_added, 'renewed', v_renewed, 'already_paid', v_already, 'skipped', v_skipped,
      'logins_linked', v_linked, 'needs_invitation', v_needs_invitation, 'details_filled', v_filled, 'honorary', v_honorary));

  return jsonb_build_object('added', v_added, 'renewed', v_renewed, 'already_paid', v_already, 'skipped', v_skipped,
    'logins_linked', v_linked, 'needs_invitation', v_needs_invitation, 'details_filled', v_filled, 'honorary', v_honorary);
end;
$$;

revoke all on function public.membermojo_import_plan(jsonb, integer) from public, anon, authenticated;
grant execute on function public.membermojo_import_plan(jsonb, integer) to service_role;
revoke all on function public.apply_membermojo_import(uuid, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.apply_membermojo_import(uuid, jsonb, integer, text) to service_role;
