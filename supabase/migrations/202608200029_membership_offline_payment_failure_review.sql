-- A returned cheque or reversed/misidentified offline payment must retain its
-- financial history while moving entitlement to an explicit officer review.

create or replace function public.report_offline_membership_payment_failure(
  p_payment_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.membership_payments%rowtype;
  v_term public.membership_terms%rowtype;
  v_member public.members%rowtype;
  v_actor uuid;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or char_length(coalesce(btrim(p_reason),''))<5 then
    raise exception 'membership_offline_failure_invalid';
  end if;
  select * into v_payment from public.membership_payments
    where id=p_payment_id and method in ('cash','bank_transfer','cheque') and status='paid' for update;
  if not found then raise exception 'membership_offline_payment_unavailable'; end if;
  select * into v_term from public.membership_terms where id=v_payment.term_id for update;
  select * into v_member from public.members where id=v_term.member_id for update;
  v_actor:=public.ensure_administrative_actor(p_actor_id);

  update public.membership_payments set status='failed',notes=left(btrim(p_reason),500),updated_at=now()
    where id=v_payment.id;
  update public.membership_terms set status='payment_review',updated_at=now() where id=v_term.id;
  update public.members set effective_state='payment_review',updated_at=now()
    where id=v_member.id and effective_state not in ('suspended','archived','honorary');
  update public.membership_offline_payment_records set status='failed',failure_reason=left(btrim(p_reason),500),
    recorded_by_actor_id=v_actor,updated_at=now()
    where term_id=v_term.id and status='cleared';

  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values(
    v_member.id,v_member.auth_user_id,v_member.contact_email,'membership.offline-payment-review',
    'Your membership payment needs review',
    'An offline membership payment could not be completed or was reversed. Access is retained temporarily while a membership officer reviews the term.',
    '/account','membership-offline-payment-review-'||v_payment.id::text
  );
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state)
  values(p_actor_id,'committee','membership.offline-payment-failed','membership_payment',v_payment.id::text,
    left(btrim(p_reason),500),jsonb_build_object('status',v_payment.status,'term_status',v_term.status),
    jsonb_build_object('status','failed','term_status','payment_review'));
  return v_term.id;
end;
$$;

revoke all on function public.report_offline_membership_payment_failure(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.report_offline_membership_payment_failure(uuid,text,uuid) to service_role;
