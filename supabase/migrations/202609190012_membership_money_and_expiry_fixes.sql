-- Two money-handling fixes found in the membership review.
--  * A refund owed after a denied membership counted every payment on the application, including
--    failed, void and still-pending card attempts, so money that was never taken could be shown as owed
--    and then written off as "refunded by hand". Only payments that actually hold money count.
--  * A cheque that had arrived but not yet cleared could not be finished once the application passed
--    its expiry date, because the expiry job closed it and it dropped out of the officer's list.
--    Applications with a cheque received are now left open.

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
    and p.status in ('paid','partially_refunded')
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

create or replace function public.expire_membership_applications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.membership_applications application
  set status='expired',updated_at=now()
  where application.status not in ('converted','rejected','expired') and (
    application.expires_at<=now()
    or (application.status='email_verification_pending' and application.verification_expires_at<=now())
    or (application.status='guardian_verification_pending' and application.guardian_verification_expires_at<=now())
  ) and not exists (
    select 1 from public.membership_offline_payment_records offline
    where offline.application_id=application.id and offline.status='received'
  );
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
