-- Keep management dashboards bounded: aggregate sensitive ledgers in Postgres and
-- expose the summaries only to the server-side service role.

create or replace function public.donation_management_summary(
  p_from timestamptz default null,
  p_until timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'gross', coalesce(sum(payment.amount_pence), 0),
    'refunds', coalesce(sum(payment.refunded_pence), 0),
    'generic', coalesce(sum(payment.amount_pence - payment.refunded_pence)
      filter (where payment.campaign = 'generic'), 0),
    'target', coalesce(sum(payment.amount_pence - payment.refunded_pence)
      filter (where payment.campaign = 'target'), 0),
    'generic_count', count(*) filter (where payment.campaign = 'generic'),
    'target_count', count(*) filter (where payment.campaign = 'target')
  )
  from public.donation_payments payment
  where (p_from is null or payment.paid_at >= p_from)
    and (p_until is null or payment.paid_at < p_until);
$$;

create or replace function public.booking_management_summary(p_event_id bigint default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with booking_totals as (
    select coalesce(sum(booking.party_size), 0)::bigint as confirmed_people
    from public.event_bookings booking
    where booking.status in ('confirmed', 'checked_in')
      and (p_event_id is null or booking.event_id = p_event_id)
  ), abuse_totals as (
    select
      coalesce(sum(summary.browser_blocks), 0)::bigint as browser,
      coalesce(sum(summary.ip_blocks), 0)::bigint as ip,
      coalesce(sum(summary.both_blocks), 0)::bigint as both,
      max(summary.last_blocked_at) as last_blocked_at
    from public.event_booking_abuse_summary summary
    where p_event_id is null or summary.event_id = p_event_id
  )
  select jsonb_build_object(
    'confirmed_people', booking_totals.confirmed_people,
    'browser', abuse_totals.browser,
    'ip', abuse_totals.ip,
    'both', abuse_totals.both,
    'last_blocked_at', abuse_totals.last_blocked_at
  )
  from booking_totals cross join abuse_totals;
$$;

revoke all on function public.donation_management_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.booking_management_summary(bigint) from public, anon, authenticated;
grant execute on function public.donation_management_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.booking_management_summary(bigint) to service_role;
