-- MemberMojo remains the membership system of record. These tables keep its
-- stable member identity separate from optional Supabase Auth portal access.

create table public.membership_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'membermojo'
    check (source = 'membermojo'),
  file_sha256 text not null unique
    check (file_sha256 ~ '^[0-9a-f]{64}$'),
  import_mode text not null
    check (import_mode in ('update_only', 'complete_active_snapshot')),
  status text not null default 'previewed'
    check (status in ('previewed', 'applied', 'rejected', 'expired')),
  source_encoding text not null
    check (source_encoding in ('utf-8', 'windows-1252')),
  row_count integer not null check (row_count between 1 and 1000),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  applied_at timestamptz,
  check ((status = 'applied') = (applied_at is not null))
);

create index membership_imports_created_at_idx
  on public.membership_imports (created_at desc);
create index membership_imports_expiry_idx
  on public.membership_imports (expires_at)
  where status = 'previewed';

create table public.membership_records (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'membermojo'
    check (source = 'membermojo'),
  external_id text not null
    check (external_id ~ '^[0-9]{1,20}$'),
  auth_user_id uuid references auth.users(id) on delete set null,
  title text not null default '' check (char_length(title) <= 30),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  membership_type text not null check (char_length(btrim(membership_type)) between 1 and 120),
  source_state text not null check (char_length(btrim(source_state)) between 1 and 50),
  source_expires_on date,
  source_renewed_on date,
  source_member_since date,
  source_rules_agreement boolean,
  membership_ended_at timestamptz,
  retention_until timestamptz,
  legal_hold boolean not null default false,
  legal_hold_reason text check (legal_hold_reason is null or char_length(legal_hold_reason) <= 500),
  legal_hold_review_at timestamptz,
  last_seen_import_id uuid references public.membership_imports(id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id),
  check (not legal_hold or nullif(btrim(legal_hold_reason), '') is not null),
  check (retention_until is null or membership_ended_at is not null)
);

create unique index membership_records_auth_user_unique
  on public.membership_records (auth_user_id)
  where auth_user_id is not null;
create index membership_records_source_state_idx
  on public.membership_records (source, source_state);
create index membership_records_retention_idx
  on public.membership_records (retention_until)
  where retention_until is not null and not legal_hold;

alter table public.membership_imports enable row level security;
alter table public.membership_records enable row level security;

revoke all on table public.membership_imports from public, anon, authenticated;
revoke all on table public.membership_records from public, anon, authenticated;

grant select, insert, update, delete on table public.membership_imports to service_role;
grant select, insert, update, delete on table public.membership_records to service_role;

comment on table public.membership_imports is
  'Non-raw evidence and lifecycle state for administrator-reviewed MemberMojo CSV imports.';
comment on table public.membership_records is
  'MemberMojo membership identities, optionally linked one-to-one to a portal Auth account.';
