-- PostgreSQL trigger RECORD fields are table-specific; use specialised
-- functions so inserts cannot attempt to resolve another table's columns.

drop trigger membership_plans_actor on public.membership_plans;
drop trigger membership_plan_prices_actor on public.membership_plan_prices;
drop trigger membership_applications_actor on public.membership_applications;
drop trigger membership_payments_actor on public.membership_payments;
drop trigger honorary_memberships_actor on public.honorary_memberships;
drop trigger user_capabilities_actor on public.user_capabilities;
drop trigger audit_logs_actor on public.audit_logs;
drop function public.attach_administrative_actor();

create or replace function public.attach_membership_plan_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin new.created_by_actor_id:=coalesce(new.created_by_actor_id,public.ensure_administrative_actor(new.created_by)); return new; end; $$;
create or replace function public.attach_membership_application_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin new.reviewed_by_actor_id:=coalesce(new.reviewed_by_actor_id,public.ensure_administrative_actor(new.reviewed_by)); return new; end; $$;
create or replace function public.attach_membership_payment_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.recorded_by_actor_id:=coalesce(new.recorded_by_actor_id,public.ensure_administrative_actor(new.received_by));
  new.offline_reference:=coalesce(new.offline_reference,new.cash_receipt_reference);
  return new;
end; $$;
create or replace function public.attach_honorary_membership_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.granted_by_actor_id:=coalesce(new.granted_by_actor_id,public.ensure_administrative_actor(new.granted_by));
  new.revoked_by_actor_id:=coalesce(new.revoked_by_actor_id,public.ensure_administrative_actor(new.revoked_by));
  return new;
end; $$;
create or replace function public.attach_capability_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin new.granted_by_actor_id:=coalesce(new.granted_by_actor_id,public.ensure_administrative_actor(new.granted_by)); return new; end; $$;
create or replace function public.attach_audit_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin new.actor_id:=coalesce(new.actor_id,public.ensure_administrative_actor(new.actor_user_id)); return new; end; $$;

revoke all on function public.attach_membership_plan_actor() from public,anon,authenticated;
revoke all on function public.attach_membership_application_actor() from public,anon,authenticated;
revoke all on function public.attach_membership_payment_actor() from public,anon,authenticated;
revoke all on function public.attach_honorary_membership_actor() from public,anon,authenticated;
revoke all on function public.attach_capability_actor() from public,anon,authenticated;
revoke all on function public.attach_audit_actor() from public,anon,authenticated;

create trigger membership_plans_actor before insert or update of created_by on public.membership_plans
for each row execute function public.attach_membership_plan_actor();
create trigger membership_plan_prices_actor before insert or update of created_by on public.membership_plan_prices
for each row execute function public.attach_membership_plan_actor();
create trigger membership_applications_actor before insert or update of reviewed_by on public.membership_applications
for each row execute function public.attach_membership_application_actor();
create trigger membership_payments_actor before insert or update of received_by on public.membership_payments
for each row execute function public.attach_membership_payment_actor();
create trigger honorary_memberships_actor before insert or update of granted_by,revoked_by on public.honorary_memberships
for each row execute function public.attach_honorary_membership_actor();
create trigger user_capabilities_actor before insert or update of granted_by on public.user_capabilities
for each row execute function public.attach_capability_actor();
create trigger audit_logs_actor before insert or update of actor_user_id on public.audit_logs
for each row execute function public.attach_audit_actor();
