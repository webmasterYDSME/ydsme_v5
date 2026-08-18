create table if not exists public.donation_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_event_id text not null,
  campaign text not null check (campaign in ('generic', 'target')),
  amount_pence bigint not null check (amount_pence >= 100),
  refunded_pence bigint not null default 0 check (
    refunded_pence >= 0 and refunded_pence <= amount_pence
  ),
  currency text not null check (currency = 'gbp'),
  payment_status text not null check (payment_status in ('paid', 'refunded'))
);

create unique index if not exists donation_payments_payment_intent_unique
  on public.donation_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists donation_payments_campaign_status_idx
  on public.donation_payments (campaign, payment_status);

alter table public.donation_payments enable row level security;

revoke all on table public.donation_payments from anon, authenticated;
grant select, insert, update, delete on table public.donation_payments to service_role;

create or replace function public.target_donation_total_pence()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(greatest(amount_pence - refunded_pence, 0)),
    0
  )::bigint
  from public.donation_payments
  where campaign = 'target'
    and payment_status in ('paid', 'refunded');
$$;

revoke all on function public.target_donation_total_pence() from public, anon, authenticated;
grant execute on function public.target_donation_total_pence() to service_role;

update public.configs
set settings = settings #- '{donations,target,raisedPence}'
where settings #> '{donations,target}' is not null;
