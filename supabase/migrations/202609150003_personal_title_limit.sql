-- Limit personal honorifics to 10 characters when saving a profile.
create or replace function public.update_own_member_profile(
  p_title text,
  p_full_name text,
  p_contact_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_contact_number text := nullif(btrim(coalesce(p_contact_number, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if char_length(v_title) > 10
    or char_length(v_full_name) not between 2 and 180
    or char_length(coalesce(v_contact_number, '')) > 40 then
    raise exception 'profile_details_invalid';
  end if;

  update public.users
  set title = v_title,
      full_name = v_full_name,
      contact_number = v_contact_number,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.members
  set title = v_title,
      full_name = v_full_name,
      contact_number = v_contact_number,
      updated_at = now()
  where auth_user_id = v_user_id;
end;
$$;

