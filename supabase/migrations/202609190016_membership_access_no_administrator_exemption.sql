-- No one is exempt from lapsing, administrators included: website access follows the membership
-- record for everyone. This replaces the function from 202609190013, which skipped administrators.
-- Note that the "two active administrators" safeguard only covers archiving, not lapsing.

create or replace function public.sync_user_access_from_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  -- A login that no longer belongs to any membership stops having members' access,
  -- unless it holds an officer role or a committee listing.
  if tg_op = 'UPDATE' and old.auth_user_id is not null and old.auth_user_id is distinct from new.auth_user_id then
    if not exists (select 1 from public.members other where other.auth_user_id = old.auth_user_id and other.id <> old.id)
      and not exists (select 1 from public.user_roles ur where ur.user_id = old.auth_user_id and ur.role <> 'member')
      and not exists (select 1 from public.committees cm where cm.user_id = old.auth_user_id) then
      update public.users set membership_status = 'suspended', updated_at = now()
      where id = old.auth_user_id and membership_status in ('active', 'lapsed');
    end if;
  end if;

  if new.auth_user_id is null then return new; end if;
  v_state := new.effective_state;

  if v_state in ('active', 'grace', 'payment_review', 'honorary') then
    update public.users set membership_status = 'active', updated_at = now()
    where id = new.auth_user_id and membership_status = 'lapsed';
  elsif v_state in ('lapsed', 'suspended') then
    update public.users set membership_status = v_state, updated_at = now()
    where id = new.auth_user_id and membership_status in ('active', 'lapsed')
      and membership_status <> v_state;
  end if;
  return new;
end;
$$;
