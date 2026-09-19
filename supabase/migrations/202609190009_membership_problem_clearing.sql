-- Two "Problems" entries had no way to be cleared by the officer:
--  * A refund owed after a membership was denied could only be cleared through the payment
--    service. Officers usually hand the money back in cash, so they can now record that.
--  * Email bounce, complaint and stopped-delivery entries stayed in the list for ever. They can
--    now be marked as dealt with.

alter table public.membership_delivery_events add column if not exists resolved_at timestamptz;

create or replace function public.record_denied_membership_refund(p_application_id uuid, p_actor uuid, p_note text)
returns integer language plpgsql security invoker set search_path='' as $$
declare a public.membership_applications; refunded integer; touched integer;
begin
 if not public.has_membership_management_capability(p_actor) or length(btrim(coalesce(p_note,'')))<5 then
  raise exception 'membership_refund_forbidden';
 end if;
 select * into a from public.membership_applications where id=p_application_id and manual_verification='denied' for update;
 if not found then raise exception 'membership_refund_unavailable'; end if;
 with owed as (
  select p.id, p.amount_pence-p.refunded_pence as pence
  from public.membership_payments p
  join public.membership_terms t on t.id=p.term_id
  where t.application_id=a.id and p.amount_pence>p.refunded_pence
 ), done as (
  update public.membership_payments p set refunded_pence=p.amount_pence, status='refunded',
   notes=left('Refunded by hand: '||btrim(p_note),500), updated_at=now()
  from owed where p.id=owed.id
  returning owed.pence
 )
 select coalesce(sum(pence),0), count(*) into refunded, touched from done;
 if touched=0 then raise exception 'membership_refund_unavailable'; end if;
 -- The reminders sent to officers when the membership was denied are finished with.
 update public.membership_notifications set read_at=now(), updated_at=now()
  where kind='membership.manual-refund-officer' and read_at is null
   and deduplication_key like 'manual-refund-'||a.id||'-%';
 insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary)
  values(p_actor,(select role from public.user_roles where user_id=p_actor limit 1),
   'membership.refund-recorded','membership_application',a.id::text,
   '£'||to_char(refunded/100.0,'FM999990.00')||' refunded by hand: '||btrim(p_note));
 return refunded;
end $$;
revoke all on function public.record_denied_membership_refund(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_denied_membership_refund(uuid,uuid,text) to service_role;
