-- One final cutover only: link unique normalized emails before staging and queue
-- conflicting portal identities for officer review.

create or replace function public.execute_membermojo_final_membership_cutover(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.has_membership_management_capability(p_actor_id) then
    raise exception 'membermojo_cutover_actor_invalid';
  end if;
  if exists(select 1 from public.audit_logs where action='membership.membermojo-cutover-staged') then
    raise exception 'membermojo_final_cutover_already_completed';
  end if;

  update public.membership_records record
  set auth_user_id=profile.id, updated_at=now()
  from public.users profile
  where record.source='membermojo' and record.auth_user_id is null
    and record.contact_email is not null
    and lower(profile.email)=lower(record.contact_email)
    and (select count(*) from public.users candidate where lower(candidate.email)=lower(record.contact_email))=1
    and (select count(*) from public.membership_records candidate
      where candidate.source='membermojo' and candidate.membership_ended_at is null
        and lower(candidate.contact_email)=lower(record.contact_email))=1
    and not exists(select 1 from public.membership_records linked where linked.auth_user_id=profile.id);

  insert into public.membership_migration_reviews(membership_record_id,review_kind,summary)
  select record.id,'portal_conflict',
    'The linked portal login email differs from the final MemberMojo contact email and requires identity review.'
  from public.membership_records record
  join public.users profile on profile.id=record.auth_user_id
  where record.source='membermojo' and record.membership_ended_at is null
    and record.contact_email is not null and lower(profile.email)<>lower(record.contact_email)
  on conflict do nothing;

  select public.stage_membermojo_membership_cutover(p_actor_id) into v_result;
  return v_result;
end;
$$;

revoke all on function public.execute_membermojo_final_membership_cutover(uuid) from public, anon, authenticated;
grant execute on function public.execute_membermojo_final_membership_cutover(uuid) to service_role;
