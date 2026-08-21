-- Expand the membership platform for officer-managed identities, additional
-- offline payment methods, guardian verification and durable staff attribution.

create table public.administrative_actors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  reference_code text not null unique,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 180),
  status text not null default 'active' check (status in ('active','former')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and ended_at is null) or status = 'former')
);

alter table public.administrative_actors enable row level security;
revoke all on public.administrative_actors from public, anon, authenticated;
grant select, insert, update on public.administrative_actors to service_role;

create or replace function public.ensure_administrative_actor(p_auth_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_name text;
begin
  if p_auth_user_id is null then return null; end if;
  select coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(u.email), ''), 'Membership officer')
    into v_name from public.users u where u.id = p_auth_user_id;
  if v_name is null then return null; end if;
  insert into public.administrative_actors(auth_user_id, reference_code, display_name)
  values(
    p_auth_user_id,
    'MO-' || upper(left(replace(p_auth_user_id::text, '-', ''), 8)),
    left(v_name, 180)
  )
  on conflict(auth_user_id) do update set
    display_name = case when public.administrative_actors.status = 'active' then excluded.display_name else public.administrative_actors.display_name end,
    updated_at = now()
  returning id into v_actor_id;
  return v_actor_id;
end;
$$;

revoke all on function public.ensure_administrative_actor(uuid) from public, anon, authenticated;
grant execute on function public.ensure_administrative_actor(uuid) to service_role;

alter table public.membership_plans add column created_by_actor_id uuid references public.administrative_actors(id) on delete restrict;
alter table public.membership_plan_prices add column created_by_actor_id uuid references public.administrative_actors(id) on delete restrict;
alter table public.membership_applications
  add column reviewed_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  add column guardian_verification_token_hash text check (guardian_verification_token_hash is null or guardian_verification_token_hash ~ '^[0-9a-f]{64}$'),
  add column guardian_verification_expires_at timestamptz,
  add column guardian_verified_at timestamptz;
alter table public.membership_payments
  add column offline_reference text check (offline_reference is null or char_length(btrim(offline_reference)) between 2 and 120),
  add column recorded_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  add column cleared_at timestamptz;
alter table public.honorary_memberships
  add column granted_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  add column revoked_by_actor_id uuid references public.administrative_actors(id) on delete restrict;
alter table public.user_capabilities add column granted_by_actor_id uuid references public.administrative_actors(id) on delete restrict;
alter table public.audit_logs add column actor_id uuid references public.administrative_actors(id) on delete restrict;

with referenced(user_id) as (
  select created_by from public.membership_plans where created_by is not null
  union select created_by from public.membership_plan_prices where created_by is not null
  union select reviewed_by from public.membership_applications where reviewed_by is not null
  union select received_by from public.membership_payments where received_by is not null
  union select granted_by from public.honorary_memberships where granted_by is not null
  union select revoked_by from public.honorary_memberships where revoked_by is not null
  union select user_id from public.user_capabilities
  union select granted_by from public.user_capabilities where granted_by is not null
  union select actor_user_id from public.audit_logs where actor_user_id is not null
)
insert into public.administrative_actors(auth_user_id, reference_code, display_name)
select referenced.user_id,
  'MO-' || upper(left(replace(referenced.user_id::text, '-', ''), 8)),
  left(coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(u.email), ''), 'Former membership officer'), 180)
from referenced
join public.users u on u.id = referenced.user_id
on conflict(auth_user_id) do nothing;

update public.membership_plans target set created_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.created_by;
update public.membership_plan_prices target set created_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.created_by;
update public.membership_applications target set reviewed_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.reviewed_by;
update public.membership_payments target set recorded_by_actor_id=actor.id,
  offline_reference=coalesce(target.offline_reference,target.cash_receipt_reference),
  cleared_at=case when target.method='cash' and target.status='paid' then coalesce(target.received_at,target.created_at) else target.cleared_at end
from public.administrative_actors actor where actor.auth_user_id=target.received_by;
update public.honorary_memberships target set granted_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.granted_by;
update public.honorary_memberships target set revoked_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.revoked_by;
update public.user_capabilities target set granted_by_actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.granted_by;
update public.audit_logs target set actor_id=actor.id
from public.administrative_actors actor where actor.auth_user_id=target.actor_user_id;

create or replace function public.attach_administrative_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'membership_plans' and new.created_by is not null then
    new.created_by_actor_id := coalesce(new.created_by_actor_id, public.ensure_administrative_actor(new.created_by));
  elsif tg_table_name = 'membership_plan_prices' and new.created_by is not null then
    new.created_by_actor_id := coalesce(new.created_by_actor_id, public.ensure_administrative_actor(new.created_by));
  elsif tg_table_name = 'membership_applications' and new.reviewed_by is not null then
    new.reviewed_by_actor_id := coalesce(new.reviewed_by_actor_id, public.ensure_administrative_actor(new.reviewed_by));
  elsif tg_table_name = 'membership_payments' and new.received_by is not null then
    new.recorded_by_actor_id := coalesce(new.recorded_by_actor_id, public.ensure_administrative_actor(new.received_by));
    new.offline_reference := coalesce(new.offline_reference,new.cash_receipt_reference);
  elsif tg_table_name = 'honorary_memberships' then
    if new.granted_by is not null then new.granted_by_actor_id := coalesce(new.granted_by_actor_id, public.ensure_administrative_actor(new.granted_by)); end if;
    if new.revoked_by is not null then new.revoked_by_actor_id := coalesce(new.revoked_by_actor_id, public.ensure_administrative_actor(new.revoked_by)); end if;
  elsif tg_table_name = 'user_capabilities' and new.granted_by is not null then
    new.granted_by_actor_id := coalesce(new.granted_by_actor_id, public.ensure_administrative_actor(new.granted_by));
  elsif tg_table_name = 'audit_logs' and new.actor_user_id is not null then
    new.actor_id := coalesce(new.actor_id, public.ensure_administrative_actor(new.actor_user_id));
  end if;
  return new;
end;
$$;

revoke all on function public.attach_administrative_actor() from public, anon, authenticated;

create trigger membership_plans_actor before insert or update of created_by on public.membership_plans
for each row execute function public.attach_administrative_actor();
create trigger membership_plan_prices_actor before insert or update of created_by on public.membership_plan_prices
for each row execute function public.attach_administrative_actor();
create trigger membership_applications_actor before insert or update of reviewed_by on public.membership_applications
for each row execute function public.attach_administrative_actor();
create trigger membership_payments_actor before insert or update of received_by on public.membership_payments
for each row execute function public.attach_administrative_actor();
create trigger honorary_memberships_actor before insert or update of granted_by,revoked_by on public.honorary_memberships
for each row execute function public.attach_administrative_actor();
create trigger user_capabilities_actor before insert or update of granted_by on public.user_capabilities
for each row execute function public.attach_administrative_actor();
create trigger audit_logs_actor before insert or update of actor_user_id on public.audit_logs
for each row execute function public.attach_administrative_actor();

alter table public.membership_applications drop constraint membership_applications_payment_method_check;
alter table public.membership_applications add constraint membership_applications_payment_method_check
  check (payment_method in ('stripe','cash','bank_transfer','cheque'));
alter table public.membership_applications drop constraint membership_applications_status_check;
alter table public.membership_applications add constraint membership_applications_status_check check (status in (
  'email_verification_pending','guardian_verification_pending','awaiting_approval','awaiting_payment',
  'awaiting_cash','awaiting_bank_transfer','awaiting_cheque','rejected','expired','converted'
));

alter table public.membership_payments drop constraint membership_payments_method_check;
alter table public.membership_payments add constraint membership_payments_method_check
  check (method in ('stripe','cash','bank_transfer','cheque'));
alter table public.membership_payments drop constraint membership_payments_check;
alter table public.membership_payments drop constraint membership_payments_check1;
alter table public.membership_payments add constraint membership_payments_refund_amount_check
  check (refunded_pence >= 0 and refunded_pence <= amount_pence);
alter table public.membership_payments add constraint membership_payments_offline_evidence_check check (
  method='stripe' or (
    offline_reference is not null and recorded_by_actor_id is not null and received_at is not null
  )
);
alter table public.honorary_memberships drop constraint honorary_memberships_check;
alter table public.honorary_memberships add constraint honorary_memberships_revocation_evidence_check check (
  (revoked_effective_on is null and revocation_reason is null and replacement_plan_id is null and revoked_by_actor_id is null and revoked_at is null)
  or (revoked_effective_on is not null and revocation_reason is not null and replacement_plan_id is not null and revoked_by_actor_id is not null and revoked_at is not null)
);

alter table public.members
  add column postal_address jsonb,
  add column preferred_contact_method text not null default 'email' check (preferred_contact_method in ('email','telephone','post','officer')),
  add column guardian_consent_note text check (guardian_consent_note is null or char_length(btrim(guardian_consent_note)) between 5 and 500);
alter table public.membership_terms
  add column expected_payment_method text check (expected_payment_method is null or expected_payment_method in ('cash','bank_transfer','cheque')),
  add column created_by_actor_id uuid references public.administrative_actors(id) on delete restrict;

create table public.membership_payment_settings_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  active boolean not null default true,
  treasurer_name text not null check (char_length(btrim(treasurer_name)) between 2 and 120),
  treasurer_email text not null check (char_length(btrim(treasurer_email)) between 3 and 254),
  treasurer_phone text check (treasurer_phone is null or char_length(btrim(treasurer_phone)) <= 50),
  bank_account_name text not null check (char_length(btrim(bank_account_name)) between 2 and 120),
  bank_sort_code text not null check (bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  bank_account_number text not null check (bank_account_number ~ '^[0-9]{8}$'),
  bank_transfer_instructions text not null check (char_length(btrim(bank_transfer_instructions)) between 5 and 500),
  cheque_payee text not null check (char_length(btrim(cheque_payee)) between 2 and 120),
  cheque_delivery_instructions text not null check (char_length(btrim(cheque_delivery_instructions)) between 5 and 500),
  cash_instructions text not null check (char_length(btrim(cash_instructions)) between 5 and 500),
  created_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index membership_payment_settings_active_idx on public.membership_payment_settings_versions(active) where active;
alter table public.membership_payment_settings_versions enable row level security;
revoke all on public.membership_payment_settings_versions from public, anon, authenticated;
grant select, insert, update on public.membership_payment_settings_versions to service_role;

insert into public.membership_payment_settings_versions(
  version,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,
  bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions
) values (
  1,'Society Treasurer','treasurer@yorkmodelengineers.co.uk',null,
  'York City & District Society of Model Engineers','00-00-00','00000000',
  'Use the unique membership reference shown in your payment instructions.',
  'York City & District Society of Model Engineers',
  'Contact the Society Treasurer to arrange delivery of your cheque.',
  'Contact the Society Treasurer to arrange a complete cash payment.'
);

alter table public.membership_applications add column payment_settings_version_id uuid
  references public.membership_payment_settings_versions(id) on delete restrict;

create table public.membership_offline_payment_records (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.membership_applications(id) on delete restrict,
  member_id uuid references public.members(id) on delete restrict,
  term_id uuid references public.membership_terms(id) on delete restrict,
  method text not null check (method in ('cash','bank_transfer','cheque')),
  status text not null default 'awaiting' check (status in ('awaiting','received','cleared','failed','void')),
  expected_amount_pence integer not null check (expected_amount_pence > 0),
  payment_reference text check (payment_reference is null or char_length(btrim(payment_reference)) between 2 and 120),
  received_on date,
  cleared_on date,
  failure_reason text check (failure_reason is null or char_length(btrim(failure_reason)) between 5 and 500),
  settings_version_id uuid references public.membership_payment_settings_versions(id) on delete restrict,
  recorded_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (application_id is not null or member_id is not null or term_id is not null),
  check (cleared_on is null or received_on is not null),
  check (status not in ('received','cleared') or (payment_reference is not null and received_on is not null and recorded_by_actor_id is not null)),
  check (status <> 'cleared' or cleared_on is not null),
  check (status <> 'failed' or failure_reason is not null)
);
create unique index membership_offline_application_open_idx on public.membership_offline_payment_records(application_id)
  where application_id is not null and status in ('awaiting','received');
create index membership_offline_records_queue_idx on public.membership_offline_payment_records(status,method,created_at);
alter table public.membership_offline_payment_records enable row level security;
revoke all on public.membership_offline_payment_records from public, anon, authenticated;
grant select, insert, update on public.membership_offline_payment_records to service_role;

create or replace function public.offboard_archived_administrative_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.membership_status='archived' and old.membership_status is distinct from new.membership_status then
    if exists(select 1 from public.user_roles where user_id=new.id and role='administrator')
      and not exists(
        select 1 from public.users u join public.user_roles r on r.user_id=u.id
        where r.role='administrator' and u.membership_status='active' and u.id<>new.id
      ) then
      raise exception 'last_active_administrator_cannot_be_archived';
    end if;
    delete from public.user_capabilities where user_id=new.id and capability='memberships.manage';
    update public.user_roles set role='member' where user_id=new.id;
    update public.committees set user_id=null where user_id=new.id;
    update public.administrative_actors set status='former',ended_at=coalesce(ended_at,now()),updated_at=now()
      where auth_user_id=new.id;
    update public.membership_notifications set email_status='cancelled',read_at=coalesce(read_at,now()),updated_at=now()
      where recipient_user_id=new.id and kind like '%-officer' and read_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.offboard_archived_administrative_actor() from public, anon, authenticated;
create trigger offboard_archived_administrative_actor after update of membership_status on public.users
for each row execute function public.offboard_archived_administrative_actor();

create or replace function public.activate_capability_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.administrative_actors set status='active',ended_at=null,updated_at=now()
  where id=public.ensure_administrative_actor(new.user_id);
  return new;
end;
$$;
revoke all on function public.activate_capability_actor() from public, anon, authenticated;
create trigger activate_capability_actor after insert on public.user_capabilities
for each row execute function public.activate_capability_actor();

comment on table public.administrative_actors is 'Durable, minimally identifying attribution for administrative decisions after a portal Auth account is deleted.';
comment on table public.membership_offline_payment_records is 'Officer reconciliation evidence for cash, bank transfer and cheque payments before or alongside immutable financial activation.';
