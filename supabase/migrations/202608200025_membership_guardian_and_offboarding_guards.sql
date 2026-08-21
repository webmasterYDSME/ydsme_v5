-- Final guards for guardian consent, safe payment configuration and former
-- officer anonymisation.

alter table public.membership_payment_settings_versions
  add column configured boolean not null default false;

create or replace function public.replace_membership_payment_settings(
  p_actor_id uuid,
  p_treasurer_name text,
  p_treasurer_email text,
  p_treasurer_phone text,
  p_bank_account_name text,
  p_bank_sort_code text,
  p_bank_account_number text,
  p_bank_transfer_instructions text,
  p_cheque_payee text,
  p_cheque_delivery_instructions text,
  p_cash_instructions text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_actor uuid;
begin
  if not exists(
    select 1 from public.users u join public.user_roles r on r.user_id=u.id
    where u.id=p_actor_id and u.membership_status='active' and r.role='administrator'
  ) then raise exception 'membership_payment_settings_forbidden'; end if;
  v_actor := public.ensure_administrative_actor(p_actor_id);
  select coalesce(max(version),0)+1 into v_version from public.membership_payment_settings_versions;
  update public.membership_payment_settings_versions set active=false where active;
  insert into public.membership_payment_settings_versions(
    version,active,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,
    bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,
    cheque_delivery_instructions,cash_instructions,created_by_actor_id
  ) values (
    v_version,true,true,btrim(p_treasurer_name),lower(btrim(p_treasurer_email)),nullif(btrim(p_treasurer_phone),''),
    btrim(p_bank_account_name),btrim(p_bank_sort_code),btrim(p_bank_account_number),
    btrim(p_bank_transfer_instructions),btrim(p_cheque_payee),btrim(p_cheque_delivery_instructions),
    btrim(p_cash_instructions),v_actor
  ) returning id into v_id;
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,after_state)
  values(p_actor_id,'administrator','membership.payment-settings-updated','membership_payment_settings',v_id::text,
    'Membership payment and Treasurer instructions updated.',jsonb_build_object('version',v_version));
  return v_id;
end;
$$;

alter table public.membership_applications add constraint membership_guardian_progress_check check (
  guardian_email is null
  or status in ('email_verification_pending','guardian_verification_pending','rejected','expired')
  or guardian_verified_at is not null
);

create or replace function public.expire_membership_applications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.membership_applications
  set status='expired',updated_at=now()
  where status not in ('converted','rejected','expired') and (
    expires_at<=now()
    or (status='email_verification_pending' and verification_expires_at<=now())
    or (status='guardian_verification_pending' and guardian_verification_expires_at<=now())
  );
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.anonymize_detached_administrative_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.auth_user_id is not null and new.auth_user_id is null then
    new.status := 'former';
    new.ended_at := coalesce(new.ended_at,now());
    new.display_name := 'Former membership officer · ' || new.reference_code;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.anonymize_detached_administrative_actor() from public,anon,authenticated;
create trigger anonymize_detached_administrative_actor before update of auth_user_id on public.administrative_actors
for each row execute function public.anonymize_detached_administrative_actor();

comment on column public.membership_payment_settings_versions.configured is
  'False only for the safe placeholder installed on fresh environments; bank transfer must not be offered until an administrator saves real details.';
