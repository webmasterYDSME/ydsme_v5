-- A card payment that succeeds but cannot be applied to a membership (the fee changed,
-- the year was already paid another way, and so on) used to make the payment webhook fail
-- and be resent for days. It is now recorded once as a payment for an officer to look at,
-- and an officer can mark it as dealt with once the money has been matched or refunded.

alter table public.membership_checkout_attempts
  add column if not exists resolved_at timestamptz;

create or replace function public.record_unapplied_membership_payment(
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt_id uuid;
begin
  update public.membership_checkout_attempts
  set status = 'payment_review',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_stripe_payment_intent_id),
      last_error = left('unapplied:' || coalesce(nullif(btrim(p_code), ''), 'unknown'), 500),
      resolved_at = null,
      updated_at = now()
  where stripe_checkout_session_id = p_stripe_checkout_session_id
    and status <> 'complete'
  returning id into v_attempt_id;
  if v_attempt_id is null then return false; end if;
  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values (null, 'system', 'membership.payment-not-applied', 'membership_checkout_attempt', v_attempt_id::text,
    'A card payment was received but could not be applied to a membership.',
    jsonb_build_object('reason', p_code, 'stripe_checkout_session_id', p_stripe_checkout_session_id));
  return true;
end;
$$;

revoke all on function public.record_unapplied_membership_payment(text, text, text)
  from public, anon, authenticated;
