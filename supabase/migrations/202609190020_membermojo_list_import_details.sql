-- The MemberMojo list import now also brings in title, date of birth, contact number and address.
-- New members get them all. Existing members only have blank details filled in; nothing is overwritten.
-- Same function signature as before, so the grants below simply re-state what 0019 set.

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

    if v_row.action in ('add', 'renew') then
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
      'logins_linked', v_linked, 'needs_invitation', v_needs_invitation, 'details_filled', v_filled));

  return jsonb_build_object('added', v_added, 'renewed', v_renewed, 'already_paid', v_already, 'skipped', v_skipped,
    'logins_linked', v_linked, 'needs_invitation', v_needs_invitation, 'details_filled', v_filled);
end;
$$;

revoke all on function public.apply_membermojo_import(uuid, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.apply_membermojo_import(uuid, jsonb, integer, text) to service_role;
