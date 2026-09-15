-- Allow active Membership Officers and administrators to version payment settings.
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
  if not public.has_membership_management_capability(p_actor_id) then
    raise exception 'membership_payment_settings_forbidden';
  end if;
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
  values(p_actor_id,(select role from public.user_roles where user_id=p_actor_id),'membership.payment-settings-updated','membership_payment_settings',v_id::text,
    'Membership payment and Treasurer instructions updated.',jsonb_build_object('version',v_version));
  return v_id;
end;
$$;
