-- Starting the website invitations failed with "UPDATE requires a WHERE clause": Supabase refuses an UPDATE
-- with no WHERE when it is run through its API, and start_member_invitations reset every row's attempt count
-- with a bare UPDATE. Same function, with a WHERE (rows already at 0 need no change). Grants are unchanged.

create or replace function public.start_member_invitations(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_pending integer;
begin
  if not public.has_membership_management_capability(p_actor_id) then raise exception 'member_invitations_actor_invalid'; end if;
  -- Starting again also gives people whose invitation failed five times another chance.
  update public.member_invitation_attempts set attempts = 0 where attempts <> 0;
  update public.member_invitation_run set enabled = true, started_at = now(), started_by = p_actor_id, finished_at = null,
    lease_until = null, paused_until = null, sent = 0, linked = 0, failed = 0, last_error = null, updated_at = now()
  where singleton;
  select count(*) into v_pending from public.member_invitation_pending;
  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
  values (p_actor_id, 'administrator', 'membermojo.invitations-started', 'member-import', gen_random_uuid()::text,
    format('Website invitations started for %s people.', v_pending));
  return public.member_invitation_status();
end;
$$;
