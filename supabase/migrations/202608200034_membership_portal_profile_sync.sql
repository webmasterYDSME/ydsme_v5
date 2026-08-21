-- Keep the optional portal profile aligned with the canonical membership
-- identity whenever an account is linked or a member edits their own details.

create or replace function public.sync_linked_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not null then
    update public.users profile
    set
      title = case
        when nullif(btrim(profile.title), '') is null then new.title
        else profile.title
      end,
      full_name = case
        when nullif(btrim(profile.full_name), '') is null then new.full_name
        else profile.full_name
      end,
      contact_number = case
        when nullif(btrim(profile.contact_number), '') is null then new.contact_number
        else profile.contact_number
      end,
      updated_at = now()
    where profile.id = new.auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_linked_member_profile_on_link on public.members;
create trigger sync_linked_member_profile_on_link
after insert or update of auth_user_id on public.members
for each row
when (new.auth_user_id is not null)
execute function public.sync_linked_member_profile();

-- Repair existing links without replacing profile details that members have
-- already supplied themselves.
update public.users profile
set
  title = case
    when nullif(btrim(profile.title), '') is null then member.title
    else profile.title
  end,
  full_name = case
    when nullif(btrim(profile.full_name), '') is null then member.full_name
    else profile.full_name
  end,
  contact_number = case
    when nullif(btrim(profile.contact_number), '') is null then member.contact_number
    else profile.contact_number
  end,
  updated_at = now()
from public.members member
where member.auth_user_id = profile.id
  and (
    nullif(btrim(profile.title), '') is null
    or nullif(btrim(profile.full_name), '') is null
    or nullif(btrim(profile.contact_number), '') is null
  );

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
  if char_length(v_title) > 30
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

revoke update on public.users from authenticated;
revoke all on function public.sync_linked_member_profile() from public, anon, authenticated;
revoke all on function public.update_own_member_profile(text, text, text) from public, anon, authenticated;
grant execute on function public.update_own_member_profile(text, text, text) to authenticated;

comment on function public.update_own_member_profile(text, text, text)
is 'Atomically updates an authenticated member portal profile and its linked canonical membership identity.';
