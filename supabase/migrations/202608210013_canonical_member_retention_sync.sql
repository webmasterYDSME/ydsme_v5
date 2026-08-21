-- Portal-account lifecycle must not orphan the canonical member's retention
-- decision. Financial and audit rows remain intact, while personal membership
-- details are anonymised by run_membership_launch_retention after 12 months.

create or replace function public.sync_canonical_member_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members member
  set retention_until = new.retention_until,
      legal_hold = new.legal_hold,
      updated_at = now()
  where member.auth_user_id = new.id
    and (member.retention_until is distinct from new.retention_until
      or member.legal_hold is distinct from new.legal_hold);
  return new;
end;
$$;

revoke all on function public.sync_canonical_member_retention()
  from public, anon, authenticated;

drop trigger if exists sync_canonical_member_retention_on_portal on public.users;
create trigger sync_canonical_member_retention_on_portal
after update of retention_until, legal_hold on public.users
for each row
when (old.retention_until is distinct from new.retention_until
  or old.legal_hold is distinct from new.legal_hold)
execute function public.sync_canonical_member_retention();

update public.members member
set retention_until = profile.retention_until,
    legal_hold = profile.legal_hold,
    updated_at = now()
from public.users profile
where member.auth_user_id = profile.id
  and (member.retention_until is distinct from profile.retention_until
    or member.legal_hold is distinct from profile.legal_hold);
