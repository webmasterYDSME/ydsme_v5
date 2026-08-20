-- Complete the membership delivery/reversal boundary after the expandable
-- schema: only email-addressed records are claimed, honorary activation emits
-- a deterministic notification, and verified Stripe reversals move paid access
-- into an auditable officer-review state atomically.

alter table public.membership_subscriptions
  add column if not exists stripe_event_created_at timestamptz;

create or replace function public.reconcile_membership_subscription(
  p_stripe_subscription_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_stripe_price_id text,
  p_event_created_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_member_id uuid;
begin
  update public.membership_subscriptions
  set status = left(p_status, 40), cancel_at_period_end = p_cancel_at_period_end,
      current_period_start = p_current_period_start, current_period_end = p_current_period_end,
      next_charge_at = case when p_cancel_at_period_end then null else p_current_period_end end,
      stripe_price_id = coalesce(p_stripe_price_id, stripe_price_id),
      stripe_event_created_at = p_event_created_at, updated_at = now()
  where stripe_subscription_id = p_stripe_subscription_id
    and (stripe_event_created_at is null or stripe_event_created_at <= p_event_created_at)
  returning member_id into v_member_id;
  return v_member_id;
end;
$$;

drop function if exists public.claim_membership_notifications(integer);
create function public.claim_membership_notifications(p_limit integer default 25)
returns table(
  notification_id uuid, member_id uuid, recipient_email text, title text, body text,
  kind text, action_href text, email_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select notification.id
    from public.membership_notifications notification
    where notification.email_status in ('queued','failed')
      and notification.recipient_email is not null
      and notification.scheduled_for <= now()
      and notification.email_attempts < 5
    order by notification.scheduled_for, notification.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.membership_notifications notification
    set email_status = 'sending', email_attempts = notification.email_attempts + 1,
        last_email_error = null, updated_at = now()
    from candidates where notification.id = candidates.id
    returning notification.*
  )
  select claimed.id, claimed.member_id, claimed.recipient_email, claimed.title, claimed.body,
    claimed.kind, claimed.action_href, claimed.email_attempts
  from claimed;
end;
$$;

revoke all on function public.claim_membership_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_membership_notifications(integer) to service_role;

create or replace function public.notify_honorary_membership_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.members%rowtype;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select * into v_member from public.members where id = new.member_id;
    insert into public.membership_notifications(
      member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
    ) values (
      new.member_id, v_member.auth_user_id, v_member.contact_email, 'membership.honorary-activated',
      'Your lifetime honorary membership is active',
      'Your lifetime honorary membership is now active. No membership fee, renewal or payment reminder applies while this entitlement remains active.',
      '/account', 'honorary-activated-' || new.id::text
    ) on conflict(deduplication_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists honorary_membership_activation_notification on public.honorary_memberships;
create trigger honorary_membership_activation_notification
after insert or update of status on public.honorary_memberships
for each row execute function public.notify_honorary_membership_activation();

create or replace function public.mark_membership_payment_reversal(
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text,
  p_refunded_pence integer,
  p_disputed boolean,
  p_stripe_event_id text
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
  v_requires_review boolean;
  v_status text;
begin
  select payment.* into v_payment
  from public.membership_payments payment
  where (p_stripe_payment_intent_id is not null and payment.stripe_payment_intent_id = p_stripe_payment_intent_id)
     or (p_stripe_charge_id is not null and payment.stripe_charge_id = p_stripe_charge_id)
  order by payment.created_at desc
  limit 1 for update;
  if not found then return null; end if;

  if p_disputed then
    v_status := 'disputed';
  elsif greatest(coalesce(p_refunded_pence, 0), 0) >= v_payment.amount_pence then
    v_status := 'refunded';
  elsif coalesce(p_refunded_pence, 0) > 0 then
    v_status := 'partially_refunded';
  else
    v_status := v_payment.status;
  end if;
  v_requires_review := p_disputed or v_status = 'refunded';

  update public.membership_payments
  set status = v_status,
      refunded_pence = least(greatest(coalesce(p_refunded_pence, refunded_pence), 0), amount_pence),
      stripe_charge_id = coalesce(stripe_charge_id, p_stripe_charge_id),
      notes = case when v_requires_review then 'Verified Stripe reversal; officer review required.' else notes end,
      updated_at = now()
  where id = v_payment.id;

  select * into v_term from public.membership_terms where id = v_payment.term_id for update;
  select * into v_member from public.members where id = v_term.member_id for update;
  if v_requires_review then
    update public.membership_terms set status = 'payment_review', updated_at = now() where id = v_term.id;
    if v_member.effective_state not in ('honorary','suspended','archived') then
      update public.members set effective_state = 'payment_review', updated_at = now() where id = v_member.id;
    end if;
  end if;

  insert into public.membership_notifications(
    member_id, recipient_user_id, recipient_email, kind, title, body, action_href, deduplication_key
  ) values (
    v_member.id, v_member.auth_user_id, v_member.contact_email,
    case when p_disputed then 'membership.payment-disputed' else 'membership.payment-refunded' end,
    case when p_disputed then 'Your membership payment is under review' else 'Your membership payment was refunded' end,
    case when v_requires_review
      then 'Your paid membership term is temporarily under review. Access is retained while a membership officer resolves it.'
      else 'A partial refund was recorded against your membership payment.' end,
    '/account', 'membership-reversal-member-' || p_stripe_event_id
  ) on conflict(deduplication_key) do nothing;

  insert into public.membership_notifications(
    member_id, recipient_user_id, kind, title, body, action_href, email_status, deduplication_key
  )
  select v_member.id, officer.user_id, 'membership.payment-review-officer',
    'Membership payment needs review',
    case when p_disputed then 'Stripe reported a disputed membership payment.' else 'Stripe reported a full or partial membership refund.' end,
    '/admin/memberships?queue=payment-review', 'membership-reversal-officer-' || p_stripe_event_id || '-' || officer.user_id::text
  from (
    select role.user_id from public.user_roles role where role.role = 'administrator'
    union
    select capability.user_id from public.user_capabilities capability where capability.capability = 'memberships.manage'
  ) officer
  on conflict(deduplication_key) do nothing;

  insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary, after_state)
  values(null, 'system', 'membership.payment-reversal', 'membership_payment', v_payment.id::text,
    'Verified Stripe payment reversal recorded.',
    jsonb_build_object('stripe_event_id', p_stripe_event_id, 'status', v_status,
      'refunded_pence', greatest(coalesce(p_refunded_pence, 0), 0), 'payment_review', v_requires_review));
  return v_member.id;
end;
$$;

revoke all on function public.mark_membership_payment_reversal(text,text,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.mark_membership_payment_reversal(text,text,integer,boolean,text) to service_role;
