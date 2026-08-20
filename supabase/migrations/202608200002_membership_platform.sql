-- Canonical website membership, billing, honorary entitlement and notification
-- foundation. MemberMojo records remain read-only migration provenance.

alter table public.users drop constraint if exists users_membership_status_check;
alter table public.users add constraint users_membership_status_check
  check (membership_status in ('active', 'lapsed', 'suspended', 'archived'));

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  minimum_age integer not null check (minimum_age between 0 and 120),
  maximum_age integer not null check (maximum_age between minimum_age and 120),
  requires_approval boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  stripe_product_id text unique check (stripe_product_id is null or stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.membership_plans(id) on delete restrict,
  membership_year integer not null check (membership_year between 2020 and 2200),
  version integer not null default 1 check (version > 0),
  amount_pence integer not null check (amount_pence > 0),
  currency text not null default 'gbp' check (currency = 'gbp'),
  stripe_price_id text unique check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, membership_year, version)
);

create unique index membership_plan_prices_current_idx
  on public.membership_plan_prices(plan_id, membership_year)
  where active;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  title text not null default '' check (char_length(title) <= 30),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 180),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_number text check (contact_number is null or char_length(contact_number) <= 40),
  date_of_birth date,
  guardian_name text check (guardian_name is null or char_length(btrim(guardian_name)) between 2 and 180),
  guardian_email text check (guardian_email is null or char_length(guardian_email) <= 254),
  guardian_consent_at timestamptz,
  current_plan_id uuid references public.membership_plans(id) on delete restrict,
  effective_state text not null default 'active'
    check (effective_state in ('active', 'honorary', 'grace', 'payment_review', 'lapsed', 'suspended', 'archived')),
  joined_on date not null default current_date,
  source text not null default 'website' check (source in ('website', 'membermojo_cutover', 'officer')),
  legacy_external_id text unique,
  legacy_membership_record_id uuid unique references public.membership_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((guardian_name is null) = (guardian_email is null)),
  check (guardian_consent_at is null or guardian_email is not null)
);

create unique index members_auth_user_unique on public.members(auth_user_id) where auth_user_id is not null;
create index members_email_idx on public.members(lower(contact_email)) where contact_email is not null;
create index members_state_idx on public.members(effective_state, full_name);

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  requested_plan_id uuid not null references public.membership_plans(id) on delete restrict,
  title text not null default '' check (char_length(title) <= 30),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 180),
  contact_email text not null check (char_length(contact_email) <= 254),
  contact_number text check (contact_number is null or char_length(contact_number) <= 40),
  date_of_birth date not null,
  student_declaration boolean not null default false,
  guardian_name text check (guardian_name is null or char_length(btrim(guardian_name)) between 2 and 180),
  guardian_email text check (guardian_email is null or char_length(guardian_email) <= 254),
  guardian_consent boolean not null default false,
  payment_method text not null check (payment_method in ('stripe', 'cash')),
  auto_renew boolean not null default true,
  status text not null default 'email_verification_pending'
    check (status in ('email_verification_pending', 'awaiting_approval', 'awaiting_payment', 'awaiting_cash', 'rejected', 'expired', 'converted')),
  verification_token_hash text not null check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  verification_expires_at timestamptz not null,
  email_verified_at timestamptz,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  terms_accepted_at timestamptz not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  converted_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check ((guardian_name is null) = (guardian_email is null)),
  check (not guardian_consent or guardian_email is not null)
);

create index membership_applications_status_idx on public.membership_applications(status, created_at);
create index membership_applications_email_idx on public.membership_applications(lower(contact_email));

create table public.membership_terms (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  plan_price_id uuid not null references public.membership_plan_prices(id) on delete restrict,
  membership_year integer not null check (membership_year between 2020 and 2200),
  starts_on date not null,
  ends_on date not null,
  grace_ends_on date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'paid', 'grace', 'payment_review', 'lapsed', 'void')),
  amount_due_pence integer not null check (amount_due_pence >= 0),
  amount_paid_pence integer not null default 0 check (amount_paid_pence >= 0),
  source text not null check (source in ('application', 'renewal', 'officer', 'membermojo_cutover')),
  application_id uuid references public.membership_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id, membership_year),
  check (ends_on >= starts_on),
  check (grace_ends_on > ends_on),
  check (amount_paid_pence <= amount_due_pence)
);

create index membership_terms_status_idx on public.membership_terms(status, membership_year);

create table public.membership_payments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.membership_terms(id) on delete restrict,
  method text not null check (method in ('stripe', 'cash')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'partially_refunded', 'refunded', 'disputed', 'void')),
  amount_pence integer not null check (amount_pence > 0),
  refunded_pence integer not null default 0 check (refunded_pence >= 0 and refunded_pence <= amount_pence),
  currency text not null default 'gbp' check (currency = 'gbp'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text unique,
  stripe_charge_id text unique,
  cash_receipt_reference text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (method = 'cash' and cash_receipt_reference is not null and received_by is not null)
    or method = 'stripe'
  )
);

create index membership_payments_term_idx on public.membership_payments(term_id, created_at desc);

create table public.membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete restrict,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_price_id text check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  status text not null check (char_length(status) between 2 and 40),
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_charge_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.honorary_memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'revoked')),
  effective_from date not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_effective_on date,
  revocation_reason text check (revocation_reason is null or char_length(btrim(revocation_reason)) between 5 and 500),
  replacement_plan_id uuid references public.membership_plans(id) on delete restrict,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (revoked_effective_on is null and revocation_reason is null and replacement_plan_id is null and revoked_by is null and revoked_at is null)
    or (revoked_effective_on is not null and revocation_reason is not null and replacement_plan_id is not null and revoked_by is not null and revoked_at is not null)
  )
);

create unique index honorary_memberships_current_idx
  on public.honorary_memberships(member_id) where status in ('scheduled', 'active');
create index honorary_memberships_effective_idx on public.honorary_memberships(status, effective_from);

create table public.user_capabilities (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability = 'memberships.manage'),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key(user_id, capability)
);

create table public.membership_notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  application_id uuid references public.membership_applications(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_email text check (recipient_email is null or char_length(recipient_email) <= 254),
  kind text not null check (char_length(kind) between 2 and 80),
  title text not null check (char_length(title) between 2 and 160),
  body text not null check (char_length(body) between 2 and 2000),
  action_href text check (action_href is null or action_href ~ '^/'),
  portal_visible boolean not null default true,
  read_at timestamptz,
  scheduled_for timestamptz not null default now(),
  email_status text not null default 'queued' check (email_status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  email_attempts integer not null default 0 check (email_attempts between 0 and 20),
  last_email_error text check (last_email_error is null or char_length(last_email_error) <= 500),
  email_sent_at timestamptz,
  deduplication_key text not null unique check (char_length(deduplication_key) between 8 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_id is not null or application_id is not null or recipient_user_id is not null),
  check (recipient_email is not null or recipient_user_id is not null)
);

create index membership_notifications_delivery_idx
  on public.membership_notifications(scheduled_for, created_at)
  where email_status in ('queued', 'failed');
create index membership_notifications_portal_idx
  on public.membership_notifications(recipient_user_id, created_at desc)
  where portal_visible;

create table public.membership_migration_reviews (
  id uuid primary key default gen_random_uuid(),
  membership_record_id uuid not null references public.membership_records(id) on delete cascade,
  review_kind text not null check (review_kind in ('honorary_candidate', 'shared_email', 'missing_email', 'portal_conflict', 'unknown_plan')),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  summary text not null check (char_length(summary) between 2 and 500),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 500),
  created_at timestamptz not null default now(),
  unique(membership_record_id, review_kind)
);

alter table public.membership_plans enable row level security;
alter table public.membership_plan_prices enable row level security;
alter table public.members enable row level security;
alter table public.membership_applications enable row level security;
alter table public.membership_terms enable row level security;
alter table public.membership_payments enable row level security;
alter table public.membership_subscriptions enable row level security;
alter table public.honorary_memberships enable row level security;
alter table public.user_capabilities enable row level security;
alter table public.membership_notifications enable row level security;
alter table public.membership_migration_reviews enable row level security;

revoke all on table public.membership_plans, public.membership_plan_prices, public.members,
  public.membership_applications, public.membership_terms, public.membership_payments,
  public.membership_subscriptions, public.honorary_memberships, public.user_capabilities,
  public.membership_notifications, public.membership_migration_reviews
  from public, anon, authenticated;

grant select, insert, update, delete on table public.membership_plans, public.membership_plan_prices,
  public.members, public.membership_applications, public.membership_terms, public.membership_payments,
  public.membership_subscriptions, public.honorary_memberships, public.user_capabilities,
  public.membership_notifications, public.membership_migration_reviews
  to service_role;

insert into public.membership_plans(slug, name, description, minimum_age, maximum_age, requires_approval, sort_order)
values
  ('junior', 'Junior associate', 'For young makers aged 14 to 17, with guardian consent.', 14, 17, true, 10),
  ('student', 'Student', 'For students aged 18 to 24.', 18, 24, true, 20),
  ('adult', 'Adult', 'Full Society membership for adults aged 18 to 79.', 18, 79, false, 30),
  ('concession', 'Concession', 'Reduced membership for members aged 80 and over.', 80, 120, true, 40);

insert into public.membership_plan_prices(plan_id, membership_year, amount_pence, version)
select id, 2026,
  case slug when 'adult' then 6000 when 'junior' then 1500 else 3000 end,
  1
from public.membership_plans;

insert into public.membership_plan_prices(plan_id, membership_year, amount_pence, version)
select id, 2027,
  case slug when 'adult' then 6000 when 'junior' then 1500 else 3000 end,
  1
from public.membership_plans;

create or replace function public.membership_billing_year(p_on_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from p_on_date)::integer + case when extract(month from p_on_date) = 12 then 1 else 0 end;
$$;

create or replace function public.prorated_membership_fee_pence(p_annual_pence integer, p_on_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from p_on_date) = 12 then p_annual_pence
    else round(p_annual_pence::numeric * (13 - extract(month from p_on_date))::numeric / 12)::integer
  end;
$$;

create or replace view public.public_membership_plans
with (security_invoker = false)
as
select
  plan.id,
  plan.slug,
  plan.name,
  plan.description,
  plan.minimum_age,
  plan.maximum_age,
  plan.requires_approval,
  price.membership_year,
  price.amount_pence,
  price.currency
from public.membership_plans plan
join public.membership_plan_prices price on price.plan_id = plan.id
where plan.active
  and price.active
  and price.membership_year = public.membership_billing_year(current_date);

revoke all on public.public_membership_plans from public;
grant select on public.public_membership_plans to anon, authenticated;

create or replace function public.has_membership_management_capability(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.user_roles role on role.user_id = u.id
    where u.id = p_user_id
      and u.membership_status = 'active'
      and (
        role.role = 'administrator'
        or (
          role.role = 'committee'
          and exists (
            select 1 from public.user_capabilities capability
            where capability.user_id = u.id and capability.capability = 'memberships.manage'
          )
        )
      )
  );
$$;

revoke all on function public.membership_billing_year(date) from public;
revoke all on function public.prorated_membership_fee_pence(integer, date) from public;
revoke all on function public.has_membership_management_capability(uuid) from public, anon, authenticated;
grant execute on function public.membership_billing_year(date) to anon, authenticated, service_role;
grant execute on function public.prorated_membership_fee_pence(integer, date) to service_role;
grant execute on function public.has_membership_management_capability(uuid) to service_role;

comment on table public.members is 'Canonical Society membership identities, separate from optional portal Auth accounts.';
comment on table public.honorary_memberships is 'Audited payment-free lifetime honorary entitlements; never represented as zero-value payments.';
comment on view public.public_membership_plans is 'Minimal public projection of currently available paid membership plans.';
