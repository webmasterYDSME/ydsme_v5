-- Email queue: two delivery classes, one rolling 24-hour budget shared by every sender, and controls
-- for administrators.
--
-- Why: the email provider allows 100 emails a day. Opening renewals used to queue an invitation for every
-- member and send them all at once, which would have used the whole allowance in a minute and left nothing
-- for the emails people are waiting for (a payment receipt, a sign-in code, a booking ticket).
--
-- Two classes:
--   immediate  Someone is waiting for it (payment and application results, booking tickets, sign-in codes,
--              officer alerts). Sent as soon as it is created, and allowed to use the whole daily budget.
--   bulk       Sent to many members on a schedule or by an officer's button (renewal invitations and
--              reminders, grace and lapse notices, price changes). Held in the queue and released a few at
--              a time, and only while the budget still has room above the reserve kept for immediate mail.
--
-- The budget is a rolling 24 hours, not a calendar day, so it can never be exceeded whichever way the
-- provider counts its day. Every email that goes through the provider takes a slot in email_send_ledger
-- first, and gives it back if the send fails.

-- ---------------------------------------------------------------- settings
create table if not exists public.email_queue_settings (
  id boolean primary key default true check (id),
  daily_limit integer not null default 100 check (daily_limit between 1 and 1000000),
  immediate_reserve integer not null default 30 check (immediate_reserve >= 0),
  bulk_batch_size integer not null default 10 check (bulk_batch_size between 1 and 100),
  bulk_paused boolean not null default false,
  blocked_until timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint email_queue_reserve_below_limit check (immediate_reserve < daily_limit)
);
insert into public.email_queue_settings(id) values (true) on conflict (id) do nothing;
alter table public.email_queue_settings enable row level security;
revoke all on public.email_queue_settings from public, anon, authenticated;
grant select, insert, update on public.email_queue_settings to service_role;

-- ------------------------------------------------------------------ ledger
create table if not exists public.email_send_ledger (
  id bigint generated always as identity primary key,
  reserved_at timestamptz not null default now(),
  source text not null check (char_length(source) between 2 and 40),
  delivery_class text not null check (delivery_class in ('immediate', 'bulk')),
  notification_id uuid references public.membership_notifications(id) on delete set null,
  state text not null default 'reserved' check (state in ('reserved', 'sent'))
);
create index if not exists email_send_ledger_window_idx on public.email_send_ledger(reserved_at);
create index if not exists email_send_ledger_notification_idx on public.email_send_ledger(notification_id) where notification_id is not null;
alter table public.email_send_ledger enable row level security;
revoke all on public.email_send_ledger from public, anon, authenticated;
grant select, insert, update, delete on public.email_send_ledger to service_role;

-- ------------------------------------------------- classes on notifications
alter table public.membership_notifications
  add column if not exists delivery_class text not null default 'immediate',
  add column if not exists requeue_count integer not null default 0,
  add column if not exists last_requeued_at timestamptz;
alter table public.membership_notifications drop constraint if exists membership_notifications_delivery_class_check;
alter table public.membership_notifications add constraint membership_notifications_delivery_class_check
  check (delivery_class in ('immediate', 'bulk'));

create or replace function public.membership_notification_delivery_class(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_kind in (
    'membership.renewal-invitation', 'membership.renewal-reminder', 'membership.renewal-upcoming',
    'membership.renewal-overdue', 'membership.grace', 'membership.lapsed', 'membership.price-changed',
    'membership.plan-transition', 'membership.retention-warning', 'membership.application-payment-reminder'
  ) then 'bulk' else 'immediate' end;
$$;
revoke all on function public.membership_notification_delivery_class(text) from public, anon, authenticated;
grant execute on function public.membership_notification_delivery_class(text) to service_role;

update public.membership_notifications set delivery_class = 'bulk'
  where delivery_class = 'immediate' and public.membership_notification_delivery_class(kind) = 'bulk';

create or replace function public.classify_membership_notification_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A test email an officer asks for is always immediate, even though it looks like a renewal invitation.
  new.delivery_class := case
    when new.deduplication_key like 'renewal-test-%' then 'immediate'
    else public.membership_notification_delivery_class(new.kind)
  end;
  return new;
end;
$$;
revoke all on function public.classify_membership_notification_delivery() from public, anon, authenticated;
drop trigger if exists b_classify_membership_notification_delivery on public.membership_notifications;
create trigger b_classify_membership_notification_delivery before insert on public.membership_notifications
for each row execute function public.classify_membership_notification_delivery();

create index if not exists membership_notifications_class_queue_idx
  on public.membership_notifications(delivery_class, scheduled_for, created_at)
  where email_status in ('queued', 'failed');

-- Only immediate mail wakes the sender the moment it is inserted. Bulk mail waits for the once-a-minute
-- sender, which releases it a few at a time.
create or replace function public.dispatch_due_membership_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_email is not null
    and new.email_status = 'queued'
    and new.delivery_class = 'immediate'
    and new.scheduled_for <= now() then
    begin
      perform public.request_membership_notification_delivery();
    exception when others then
      -- The durable outbox row must survive a delivery configuration or network
      -- failure. The recovery job reports the configuration error and retries.
      raise warning 'Immediate membership email dispatch could not be requested.';
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.dispatch_due_membership_notification() from public, anon, authenticated;

-- ------------------------------------------------------------------ budget
create or replace function public.email_budget()
returns table(
  daily_limit integer, immediate_reserve integer, used integer, remaining integer, bulk_remaining integer,
  bulk_paused boolean, blocked_until timestamptz, blocked_reason text, next_bulk_slot_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  s public.email_queue_settings%rowtype;
  v_used integer;
  v_cap integer;
begin
  select * into s from public.email_queue_settings where id;
  select count(*)::integer into v_used from public.email_send_ledger where reserved_at > now() - interval '24 hours';
  v_cap := s.daily_limit - s.immediate_reserve;
  daily_limit := s.daily_limit;
  immediate_reserve := s.immediate_reserve;
  used := v_used;
  remaining := greatest(0, s.daily_limit - v_used);
  bulk_remaining := greatest(0, v_cap - v_used);
  bulk_paused := s.bulk_paused;
  blocked_until := case when s.blocked_until > now() then s.blocked_until end;
  blocked_reason := case when s.blocked_until > now() then s.blocked_reason end;
  -- When the next bulk slot opens up: the moment the oldest send that is holding the budget full ages out.
  next_bulk_slot_at := case when v_used >= v_cap then (
    select ledger.reserved_at + interval '24 hours'
    from public.email_send_ledger ledger
    where ledger.reserved_at > now() - interval '24 hours'
    order by ledger.reserved_at
    offset greatest(0, v_used - v_cap) limit 1
  ) end;
  return next;
end;
$$;
revoke all on function public.email_budget() from public, anon, authenticated;
grant execute on function public.email_budget() to service_role;

-- Takes a slot for one email that is about to go to the provider. Returns the slot, or null when there is
-- no room (the daily budget is used up, bulk mail has hit the reserve, or the provider has told us to wait).
create or replace function public.reserve_email_slot(p_class text, p_source text, p_notification_id uuid default null)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.email_queue_settings%rowtype;
  v_used integer;
  v_cap integer;
  v_id bigint;
begin
  if p_class not in ('immediate', 'bulk') then raise exception 'email_class_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('email_send_ledger'));
  delete from public.email_send_ledger
    where (state = 'reserved' and reserved_at < now() - interval '30 minutes')
      or reserved_at < now() - interval '3 days';
  select * into s from public.email_queue_settings where id;
  if s.blocked_until is not null and s.blocked_until > now() then return null; end if;
  if p_class = 'bulk' and s.bulk_paused then return null; end if;
  select count(*)::integer into v_used from public.email_send_ledger where reserved_at > now() - interval '24 hours';
  v_cap := s.daily_limit;
  if p_class = 'bulk' then v_cap := s.daily_limit - s.immediate_reserve; end if;
  if v_used >= v_cap then return null; end if;
  insert into public.email_send_ledger(source, delivery_class, notification_id)
    values (left(p_source, 40), p_class, p_notification_id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_email_slot(text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_email_slot(text, text, uuid) to service_role;

create or replace function public.release_email_slot(p_ledger_id bigint, p_sent boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_sent then
    update public.email_send_ledger set state = 'sent' where id = p_ledger_id;
  else
    delete from public.email_send_ledger where id = p_ledger_id;
  end if;
end;
$$;
revoke all on function public.release_email_slot(bigint, boolean) from public, anon, authenticated;
grant execute on function public.release_email_slot(bigint, boolean) to service_role;

-- The provider said it will not take more mail for a while (its own daily quota, or too many a second).
create or replace function public.pause_email_provider(p_seconds integer, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.email_queue_settings set
    blocked_until = greatest(coalesce(blocked_until, now()), now() + make_interval(secs => least(86400, greatest(10, p_seconds)))),
    blocked_reason = left(coalesce(nullif(btrim(p_reason), ''), 'The email provider asked us to wait.'), 300),
    updated_at = now()
  where id;
end;
$$;
revoke all on function public.pause_email_provider(integer, text) from public, anon, authenticated;
grant execute on function public.pause_email_provider(integer, text) to service_role;

-- ------------------------------------------------------------------- claim
-- Immediate mail is claimed first and may use the whole remaining budget. Bulk mail is claimed after it, a
-- few at a time, and only while the budget is below (daily limit - reserve). Slots are taken here, inside
-- one lock, so several senders running at once cannot overspend.
drop function if exists public.claim_membership_notifications(integer);
create function public.claim_membership_notifications(p_limit integer default 25)
returns table(
  notification_id uuid, member_id uuid, recipient_email text, title text, body text,
  kind text, action_href text, email_attempts integer, delivery_class text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.email_queue_settings%rowtype;
  v_used integer;
  v_room integer;
  v_taken integer := 0;
  v_now integer;
  v_limit integer := greatest(1, least(p_limit, 100));
begin
  perform pg_advisory_xact_lock(hashtext('email_send_ledger'));
  delete from public.email_send_ledger
    where (state = 'reserved' and reserved_at < now() - interval '30 minutes')
      or reserved_at < now() - interval '3 days';
  update public.membership_notifications notification
  set email_status = 'failed', last_email_error = 'A stale delivery claim was recovered.',
      scheduled_for = now(), updated_at = now()
  where notification.email_status = 'sending' and notification.updated_at < now() - interval '10 minutes';

  select * into s from public.email_queue_settings where id;
  if s.blocked_until is not null and s.blocked_until > now() then return; end if;
  select count(*)::integer into v_used from public.email_send_ledger where reserved_at > now() - interval '24 hours';

  -- 1. Immediate mail: the whole remaining budget is available.
  v_room := least(v_limit, greatest(0, s.daily_limit - v_used));
  if v_room > 0 then
    return query
    with candidates as (
      select notification.id
      from public.membership_notifications notification
      left join public.membership_email_suppressions suppression
        on suppression.normalized_email = lower(notification.recipient_email)
      where notification.email_status in ('queued', 'failed')
        and notification.delivery_class = 'immediate'
        and notification.recipient_email is not null
        and notification.scheduled_for <= now()
        and notification.email_attempts < 5
        and coalesce(suppression.transactional_suppressed, false) = false
      order by notification.scheduled_for, notification.created_at
      for update of notification skip locked
      limit v_room
    ), claimed as (
      update public.membership_notifications notification
      set email_status = 'sending', email_attempts = notification.email_attempts + 1,
          last_email_error = null, updated_at = now()
      from candidates where notification.id = candidates.id
      returning notification.*
    ), slots as (
      insert into public.email_send_ledger(source, delivery_class, notification_id)
      select 'membership', 'immediate', claimed.id from claimed
    )
    select claimed.id, claimed.member_id, claimed.recipient_email, claimed.title, claimed.body,
      claimed.kind, claimed.action_href, claimed.email_attempts, claimed.delivery_class
    from claimed;
    get diagnostics v_taken = row_count;
  end if;

  -- 2. Bulk mail: a few at a time, and only above the reserve kept for immediate mail.
  v_now := v_used + v_taken;
  v_room := least(v_limit - v_taken, s.bulk_batch_size, greatest(0, s.daily_limit - s.immediate_reserve - v_now));
  if v_room > 0 and not s.bulk_paused then
    return query
    with candidates as (
      select notification.id
      from public.membership_notifications notification
      left join public.membership_email_suppressions suppression
        on suppression.normalized_email = lower(notification.recipient_email)
      where notification.email_status in ('queued', 'failed')
        and notification.delivery_class = 'bulk'
        and notification.recipient_email is not null
        and notification.scheduled_for <= now()
        and notification.email_attempts < 5
        and coalesce(suppression.transactional_suppressed, false) = false
      order by notification.scheduled_for, notification.created_at
      for update of notification skip locked
      limit v_room
    ), claimed as (
      update public.membership_notifications notification
      set email_status = 'sending', email_attempts = notification.email_attempts + 1,
          last_email_error = null, updated_at = now()
      from candidates where notification.id = candidates.id
      returning notification.*
    ), slots as (
      insert into public.email_send_ledger(source, delivery_class, notification_id)
      select 'membership', 'bulk', claimed.id from claimed
    )
    select claimed.id, claimed.member_id, claimed.recipient_email, claimed.title, claimed.body,
      claimed.kind, claimed.action_href, claimed.email_attempts, claimed.delivery_class
    from claimed;
  end if;
  return;
end;
$$;
revoke all on function public.claim_membership_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_membership_notifications(integer) to service_role;

-- ---------------------------------------------------------------- complete
-- Same as before, and it also settles the slot: kept when the email went, given back when it did not.
drop function if exists public.complete_membership_notification(uuid, boolean, text, text);
create function public.complete_membership_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare v_notification public.membership_notifications%rowtype;
begin
  update public.membership_notifications notification set
    email_status = case when p_sent then 'sent' else 'failed' end,
    email_sent_at = case when p_sent then now() else null end,
    provider_message_id = case when p_sent then coalesce(p_provider_message_id, notification.provider_message_id) else notification.provider_message_id end,
    provider_delivery_status = case when p_sent then 'accepted' else notification.provider_delivery_status end,
    last_email_error = case when p_sent then null else left(coalesce(p_error, 'Email delivery failed.'), 500) end,
    scheduled_for = case when p_sent then notification.scheduled_for
      else now() + make_interval(secs => least(21600, greatest(60, power(2, least(notification.email_attempts, 8))::integer * 60))) end,
    updated_at = now()
  where notification.id = p_notification_id and notification.email_status = 'sending'
  returning * into v_notification;
  if not found then return false; end if;

  if p_sent then
    update public.email_send_ledger set state = 'sent' where notification_id = p_notification_id and state = 'reserved';
  else
    delete from public.email_send_ledger where notification_id = p_notification_id and state = 'reserved';
  end if;

  if not p_sent and v_notification.email_attempts >= 5 then
    insert into public.membership_notifications(
      member_id, application_id, recipient_user_id, kind, title, body, action_href,
      portal_visible, email_status, deduplication_key
    ) select v_notification.member_id, v_notification.application_id, officer.user_id,
      'membership.email-delivery-officer', 'Membership email needs attention',
      format('An email concerning %s could not be delivered after five attempts. Correct the address or retry it from the membership area.',
        coalesce(member.full_name, application.full_name, 'a member')),
      '/admin/memberships?section=delivery-problems#delivery-problems', true, 'cancelled',
      'membership-email-exhausted-' || v_notification.id::text || '-' || officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role = 'administrator'
      union select capability.user_id from public.user_capabilities capability where capability.capability = 'memberships.manage'
    ) officer
    left join public.members member on member.id = v_notification.member_id
    left join public.membership_applications application on application.id = v_notification.application_id
    on conflict(deduplication_key) do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.complete_membership_notification(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.complete_membership_notification(uuid, boolean, text, text) to service_role;

-- The provider could not take this one right now (too many a second, or its daily quota). It goes back in
-- the queue without using up one of its attempts.
create or replace function public.defer_membership_notification(p_notification_id uuid, p_seconds integer, p_reason text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.membership_notifications set
    email_status = 'queued', email_attempts = greatest(0, email_attempts - 1),
    scheduled_for = now() + make_interval(secs => least(86400, greatest(10, p_seconds))),
    last_email_error = left(coalesce(nullif(btrim(p_reason), ''), 'Waiting for the email provider.'), 500),
    updated_at = now()
  where id = p_notification_id and email_status = 'sending';
  if not found then return false; end if;
  delete from public.email_send_ledger where notification_id = p_notification_id and state = 'reserved';
  return true;
end;
$$;
revoke all on function public.defer_membership_notification(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.defer_membership_notification(uuid, integer, text) to service_role;

-- ---------------------------------------------------------- administrator
-- Put emails back in the queue. Called only by the administrator page (service role).
create or replace function public.requeue_membership_notifications(p_ids uuid[] default null, p_scope text default 'ids')
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if p_scope not in ('ids', 'failed') then raise exception 'email_requeue_scope_invalid'; end if;
  update public.membership_notifications notification set
    email_status = 'queued', email_attempts = 0, scheduled_for = now(),
    last_email_error = null, provider_delivery_status = null, email_sent_at = null,
    requeue_count = notification.requeue_count + 1, last_requeued_at = now(), updated_at = now()
  where notification.recipient_email is not null
    and (
      (p_scope = 'failed' and notification.email_status = 'failed')
      or (p_scope = 'ids' and notification.id = any(coalesce(p_ids, '{}'::uuid[]))
          and notification.email_status in ('failed', 'sent', 'cancelled'))
    )
    and not exists (
      select 1 from public.membership_email_suppressions suppression
      where suppression.normalized_email = lower(notification.recipient_email) and suppression.transactional_suppressed
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.requeue_membership_notifications(uuid[], text) from public, anon, authenticated;
grant execute on function public.requeue_membership_notifications(uuid[], text) to service_role;

-- Stop emails that have not gone yet (for example bulk invitations sent by mistake). They can be put back later.
create or replace function public.cancel_queued_membership_notifications(p_ids uuid[] default null, p_scope text default 'ids')
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if p_scope not in ('ids', 'bulk') then raise exception 'email_cancel_scope_invalid'; end if;
  update public.membership_notifications notification set
    email_status = 'cancelled', last_email_error = 'Stopped by an administrator.', updated_at = now()
  where notification.email_status in ('queued', 'failed')
    and notification.recipient_email is not null
    and (
      (p_scope = 'bulk' and notification.delivery_class = 'bulk')
      or (p_scope = 'ids' and notification.id = any(coalesce(p_ids, '{}'::uuid[])))
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.cancel_queued_membership_notifications(uuid[], text) from public, anon, authenticated;
grant execute on function public.cancel_queued_membership_notifications(uuid[], text) to service_role;

-- Everything the administrator page shows at the top, in one call.
create or replace function public.email_queue_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'budget', (select to_jsonb(budget) from public.email_budget() budget),
    'settings', (select jsonb_build_object('bulk_batch_size', s.bulk_batch_size) from public.email_queue_settings s where s.id),
    'queued_immediate', count(*) filter (where n.email_status = 'queued' and n.delivery_class = 'immediate' and n.recipient_email is not null),
    'queued_bulk', count(*) filter (where n.email_status = 'queued' and n.delivery_class = 'bulk' and n.recipient_email is not null),
    'sending', count(*) filter (where n.email_status = 'sending'),
    'failed', count(*) filter (where n.email_status = 'failed'),
    'cancelled', count(*) filter (where n.email_status = 'cancelled' and n.recipient_email is not null),
    'sent_7_days', count(*) filter (where n.email_status = 'sent' and n.email_sent_at > now() - interval '7 days'),
    'oldest_queued_at', min(n.created_at) filter (where n.email_status = 'queued' and n.recipient_email is not null)
  )
  from public.membership_notifications n;
$$;
revoke all on function public.email_queue_overview() from public, anon, authenticated;
grant execute on function public.email_queue_overview() to service_role;

-- ------------------------------------------------------ renewal test email
-- An email an officer sends to themselves to see a renewal invitation. It uses a real member's fee and
-- payment wording, is addressed only to the officer, is never recorded against a member, and is immediate.
create or replace function public.queue_membership_renewal_test(p_year integer, p_actor uuid, p_recipient text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare m public.members;
begin
  if not public.has_membership_management_capability(p_actor) then raise exception 'membership_campaign_unavailable'; end if;
  if nullif(btrim(p_recipient), '') is null then raise exception 'membership_test_recipient_missing'; end if;
  select * into m from public.members
    where effective_state = 'active' and contact_email is not null
      and not public.membership_honorary_covers_year(id, p_year)
    order by (auth_user_id = p_actor) desc nulls last, created_at limit 1;
  if not found then return false; end if;
  insert into public.membership_notifications(
    recipient_user_id, recipient_email, kind, title, body, action_href, portal_visible, deduplication_key
  ) values (
    p_actor, btrim(p_recipient), 'membership.renewal-invitation',
    '[Test] Renew ' || m.full_name || '''s ' || p_year || ' membership',
    concat_ws(E'\n\n',
      'This is a test. It was sent only to you, and nothing has been sent to any member. The renewal button below is not a real link.',
      m.full_name || '''s membership of the Society is due for renewal for ' || p_year || '.',
      public.membership_renewal_fee_text(m.id, p_year),
      public.membership_renewal_payment_text(m.id, p_year)),
    '/membership/renew?token=test', false, 'renewal-test-' || gen_random_uuid()::text
  );
  return true;
end;
$$;
revoke all on function public.queue_membership_renewal_test(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.queue_membership_renewal_test(integer, uuid, text) to service_role;
