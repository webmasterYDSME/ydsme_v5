-- Members can see and correct their own postal address and date of birth on their account page.
--
-- The address is theirs to change. The date of birth decides which membership fee band applies as they get
-- older, so a member can add it when it is missing, or add the day when it was imported with only a month and
-- year (stored as the 1st of the month), but cannot otherwise change it: an officer does that.

create or replace function public.get_own_member_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member record;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select date_of_birth, postal_address into v_member
  from public.members where auth_user_id = v_user and anonymized_at is null;
  if not found then return jsonb_build_object('linked', false); end if;
  return jsonb_build_object(
    'linked', true,
    'date_of_birth', v_member.date_of_birth,
    -- Imported from MemberMojo with a month and year only: the day is a placeholder the member may replace.
    'birth_day_unconfirmed', v_member.date_of_birth is not null and extract(day from v_member.date_of_birth) = 1,
    'birth_date_locked', v_member.date_of_birth is not null and extract(day from v_member.date_of_birth) <> 1,
    'address_line_one', coalesce(v_member.postal_address->>'address_line_one', ''),
    'address_line_two', coalesce(v_member.postal_address->>'address_line_two', ''),
    'city', coalesce(v_member.postal_address->>'city', ''),
    'postcode', coalesce(v_member.postal_address->>'postcode', '')
  );
end;
$$;

create or replace function public.update_own_member_details(
  p_address_line_one text,
  p_address_line_two text,
  p_city text,
  p_postcode text,
  p_date_of_birth date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.members%rowtype;
  v_one text := nullif(btrim(coalesce(p_address_line_one, '')), '');
  v_two text := nullif(btrim(coalesce(p_address_line_two, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_postcode text := nullif(btrim(coalesce(p_postcode, '')), '');
  v_address jsonb;
  v_birth_changed boolean := false;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(coalesce(v_one, '')) > 180 or char_length(coalesce(v_two, '')) > 180
    or char_length(coalesce(v_city, '')) > 100 or char_length(coalesce(v_postcode, '')) > 20 then
    raise exception 'member_details_invalid';
  end if;
  select * into v_member from public.members where auth_user_id = v_user and anonymized_at is null for update;
  if not found then raise exception 'member_details_member_not_found'; end if;

  if p_date_of_birth is not null and p_date_of_birth is distinct from v_member.date_of_birth then
    if p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01' then raise exception 'member_birth_date_invalid'; end if;
    if v_member.date_of_birth is not null and not (
      extract(day from v_member.date_of_birth) = 1
      and date_trunc('month', v_member.date_of_birth) = date_trunc('month', p_date_of_birth::timestamp)
    ) then
      raise exception 'member_birth_date_locked';
    end if;
    v_birth_changed := true;
  end if;

  -- A line 1, town or postcode makes an address; without any of them the address is cleared.
  v_address := case when v_one is null and v_city is null and v_postcode is null then null else jsonb_build_object(
    'address_line_one', v_one, 'address_line_two', v_two, 'city', v_city, 'postcode', v_postcode,
    'country', coalesce(v_member.postal_address->>'country', 'United Kingdom')) end;

  update public.members set
    postal_address = v_address,
    date_of_birth = case when v_birth_changed then p_date_of_birth else date_of_birth end,
    updated_at = now()
  where id = v_member.id;

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
  values (v_user, 'member', 'member.details-updated', 'member', v_member.id::text,
    case when v_birth_changed then 'Updated their postal address and date of birth on the account page.'
      else 'Updated their postal address on the account page.' end);
end;
$$;

revoke all on function public.get_own_member_details() from public, anon;
revoke all on function public.update_own_member_details(text, text, text, text, date) from public, anon;
grant execute on function public.get_own_member_details() to authenticated, service_role;
grant execute on function public.update_own_member_details(text, text, text, text, date) to authenticated, service_role;
