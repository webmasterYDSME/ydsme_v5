-- A fresh installation deliberately contains no default privileged account.
-- A verified Auth user may be promoted once, using the service-role-only
-- bootstrap command, after the migration chain has completed.

create or replace function public.bootstrap_first_administrator(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_email_confirmed_at timestamptz;
begin
  if exists(select 1 from public.user_roles where role = 'administrator') then
    raise exception 'administrator_bootstrap_already_completed';
  end if;

  select email, email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users
  where id = p_user_id;

  if v_email is null then
    raise exception 'administrator_bootstrap_user_not_found';
  end if;
  if v_email_confirmed_at is null then
    raise exception 'administrator_bootstrap_email_not_verified';
  end if;
  if not exists(select 1 from public.users where id = p_user_id) then
    raise exception 'administrator_bootstrap_profile_not_found';
  end if;

  update public.users
  set membership_status = 'active',
      retention_until = null,
      retention_purge_claim_token = null,
      retention_purge_claimed_at = null,
      retention_purge_last_error = null,
      updated_at = now()
  where id = p_user_id;

  insert into public.user_roles(user_id, role)
  values(p_user_id, 'administrator')
  on conflict(user_id) do update set role = excluded.role;

  insert into public.audit_logs(
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    after_state
  ) values (
    null,
    'system',
    'administrator.bootstrap',
    'user',
    p_user_id::text,
    'The first administrator was assigned through the guarded bootstrap process.',
    jsonb_build_object('user_id', p_user_id, 'email_verified', true)
  );

  return p_user_id;
end;
$$;

revoke all on function public.bootstrap_first_administrator(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_administrator(uuid) to service_role;

comment on function public.bootstrap_first_administrator(uuid) is
  'Promotes one verified Auth user only when no administrator role exists. Intended for one-time installation bootstrap.';
