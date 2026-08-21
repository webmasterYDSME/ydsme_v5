-- Launch remediation: shared correspondence addresses, checkout idempotency,
-- provider-command recovery, lifecycle transitions, delivery evidence and
-- retention/report foundations. Email is deliberately not a member identity.

alter table public.members
  add column if not exists contact_email_verified_at timestamptz,
  add column if not exists contact_role text not null default 'self'
    check (contact_role in ('self','guardian','shared_household')),
  add column if not exists portal_invitation_status text not null default 'eligible'
    check (portal_invitation_status in ('not_requested','eligible','sent','linked','blocked_shared','declined')),
  add column if not exists newsletter_opt_in boolean not null default false,
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists anonymized_at timestamptz;

update public.members
set contact_email_verified_at = coalesce(contact_email_verified_at, created_at)
where contact_email is not null and source = 'website';

update public.members
set portal_invitation_status = case
  when auth_user_id is not null then 'linked'
  when contact_email is null or contact_role = 'guardian' then 'not_requested'
  else portal_invitation_status
end;

alter table public.membership_applications
  add column if not exists contact_role text not null default 'self'
    check (contact_role in ('self','guardian','shared_household')),
  add column if not exists guardian_led boolean not null default false,
  add column if not exists application_status_token_hash text
    check (application_status_token_hash is null or application_status_token_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists application_status_expires_at timestamptz,
  add column if not exists portal_invitation_status text not null default 'eligible'
    check (portal_invitation_status in ('not_requested','eligible','sent','linked','blocked_shared','declined')),
  add column if not exists newsletter_opt_in boolean not null default false,
  add column if not exists retention_anonymized_at timestamptz;

alter table public.membership_applications alter column date_of_birth drop not null;
alter table public.membership_applications
  drop constraint if exists membership_application_identity_retention_check;
alter table public.membership_applications
  add constraint membership_application_identity_retention_check check (
    retention_anonymized_at is not null
    or date_of_birth is not null
  );
alter table public.membership_applications
  drop constraint if exists membership_application_guardian_led_check;
alter table public.membership_applications
  add constraint membership_application_guardian_led_check check (
    not guardian_led
    or (
      contact_role = 'guardian'
      and guardian_email is not null
      and lower(contact_email) = lower(guardian_email)
    )
  );

create table public.membership_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('application','renewal','honorary_transition')),
  application_id uuid references public.membership_applications(id) on delete restrict,
  member_id uuid references public.members(id) on delete restrict,
  membership_year integer not null check (membership_year between 2020 and 2200),
  plan_price_id uuid not null references public.membership_plan_prices(id) on delete restrict,
  amount_pence integer not null check (amount_pence > 0),
  currency text not null default 'gbp' check (currency = 'gbp'),
  auto_renew boolean not null default true,
  status text not null default 'creating'
    check (status in ('creating','open','complete','expired','failed','payment_review')),
  stripe_checkout_session_id text unique,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purpose = 'application' and application_id is not null and member_id is null)
    or (purpose <> 'application' and member_id is not null))
);
create unique index membership_checkout_application_open_idx
  on public.membership_checkout_attempts(application_id)
  where application_id is not null and status in ('creating','open');
create unique index membership_checkout_member_year_open_idx
  on public.membership_checkout_attempts(member_id,membership_year,purpose)
  where member_id is not null and status in ('creating','open');
create index membership_checkout_problem_idx
  on public.membership_checkout_attempts(status,updated_at)
  where status in ('failed','payment_review');

create table public.membership_provider_commands (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete restrict,
  checkout_attempt_id uuid references public.membership_checkout_attempts(id) on delete restrict,
  command_type text not null check (command_type in ('cancel_at_boundary','resume_auto_renew','cancel_for_offline_payment','cancel_for_honorary','transition_price')),
  stripe_subscription_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','complete','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index membership_provider_command_queue_idx
  on public.membership_provider_commands(status,next_attempt_at)
  where status in ('queued','failed');

create table public.membership_plan_transitions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  membership_year integer not null check (membership_year between 2020 and 2200),
  from_plan_id uuid not null references public.membership_plans(id) on delete restrict,
  to_plan_id uuid not null references public.membership_plans(id) on delete restrict,
  reason text not null check (reason in ('age','student_request','honorary_replacement','dob_correction')),
  status text not null default 'scheduled'
    check (status in ('scheduled','awaiting_student_review','approved','rejected','applied','cancelled')),
  effective_on date not null,
  requested_at timestamptz,
  reviewed_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id,membership_year)
);
create index membership_plan_transition_queue_idx
  on public.membership_plan_transitions(status,effective_on);

create table public.membership_contact_change_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete restrict,
  application_id uuid references public.membership_applications(id) on delete restrict,
  contact_kind text not null check (contact_kind in ('correspondence','portal_login','guardian')),
  requested_email text not null check (char_length(requested_email) <= 254),
  requested_role text check (requested_role is null or requested_role in ('self','guardian','shared_household')),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','confirmed','expired','cancelled')),
  expires_at timestamptz not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_actor_id uuid references public.administrative_actors(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 500),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((member_id is not null) <> (application_id is not null))
);

create table public.membership_delivery_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.membership_notifications(id) on delete cascade,
  provider_message_id text,
  provider_event_id text unique,
  event_type text not null check (event_type in ('accepted','delivered','bounced','complained','suppressed')),
  safe_detail text check (safe_detail is null or char_length(safe_detail) <= 500),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index membership_delivery_notification_idx
  on public.membership_delivery_events(notification_id,occurred_at desc);

create table public.membership_report_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by_actor_id uuid not null references public.administrative_actors(id) on delete restrict,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','expired')),
  storage_path text,
  row_counts jsonb,
  financial_totals jsonb,
  expires_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.membership_email_suppressions (
  normalized_email text primary key,
  newsletter_suppressed boolean not null default false,
  transactional_suppressed boolean not null default false,
  reason text not null check (char_length(reason) between 2 and 500),
  updated_at timestamptz not null default now()
);

alter table public.membership_migration_reviews
  add column if not exists review_group_key text;
create index if not exists membership_migration_review_group_idx
  on public.membership_migration_reviews(review_group_key,status)
  where review_group_key is not null;

alter table public.membership_checkout_attempts enable row level security;
alter table public.membership_provider_commands enable row level security;
alter table public.membership_plan_transitions enable row level security;
alter table public.membership_contact_change_requests enable row level security;
alter table public.membership_delivery_events enable row level security;
alter table public.membership_report_exports enable row level security;
alter table public.membership_email_suppressions enable row level security;

revoke all on public.membership_checkout_attempts, public.membership_provider_commands,
  public.membership_plan_transitions, public.membership_contact_change_requests,
  public.membership_delivery_events, public.membership_report_exports,
  public.membership_email_suppressions from public,anon,authenticated;
grant select,insert,update on public.membership_checkout_attempts, public.membership_provider_commands,
  public.membership_plan_transitions, public.membership_contact_change_requests,
  public.membership_delivery_events, public.membership_report_exports,
  public.membership_email_suppressions to service_role;

create or replace function public.reserve_membership_checkout_attempt(
  p_purpose text,
  p_application_id uuid,
  p_member_id uuid,
  p_membership_year integer,
  p_plan_price_id uuid,
  p_amount_pence integer,
  p_auto_renew boolean
)
returns table(attempt_id uuid, stripe_checkout_session_id text, attempt_status text, attempt_created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.membership_checkout_attempts%rowtype;
  v_lock_key text;
begin
  if p_purpose not in ('application','renewal','honorary_transition')
    or p_membership_year not between 2020 and 2200
    or p_amount_pence <= 0
    or (p_purpose='application' and (p_application_id is null or p_member_id is not null))
    or (p_purpose<>'application' and p_member_id is null) then
    raise exception 'membership_checkout_attempt_invalid';
  end if;
  v_lock_key := coalesce(p_application_id::text,p_member_id::text)||':'||p_membership_year::text||':'||p_purpose;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key,0));

  update public.membership_checkout_attempts
  set status='expired',updated_at=now()
  where status in ('creating','open') and expires_at<=now()
    and ((p_application_id is not null and application_id=p_application_id)
      or (p_member_id is not null and member_id=p_member_id and membership_year=p_membership_year and purpose=p_purpose));

  select * into v_attempt from public.membership_checkout_attempts
  where status in ('creating','open')
    and ((p_application_id is not null and application_id=p_application_id)
      or (p_member_id is not null and member_id=p_member_id and membership_year=p_membership_year and purpose=p_purpose))
  order by created_at desc limit 1 for update;

  if found then
    if v_attempt.plan_price_id<>p_plan_price_id or v_attempt.amount_pence<>p_amount_pence
      or v_attempt.auto_renew<>p_auto_renew then
      update public.membership_checkout_attempts set status='expired',updated_at=now() where id=v_attempt.id;
      v_attempt := null;
    else
      return query select v_attempt.id,v_attempt.stripe_checkout_session_id,v_attempt.status,false;
      return;
    end if;
  end if;

  insert into public.membership_checkout_attempts(
    purpose,application_id,member_id,membership_year,plan_price_id,amount_pence,auto_renew
  ) values (
    p_purpose,p_application_id,p_member_id,p_membership_year,p_plan_price_id,p_amount_pence,p_auto_renew
  ) returning * into v_attempt;
  return query select v_attempt.id,v_attempt.stripe_checkout_session_id,v_attempt.status,true;
end;
$$;

create or replace function public.attach_membership_checkout_session(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.membership_checkout_attempts
  set stripe_checkout_session_id=p_stripe_checkout_session_id,status='open',
      expires_at=p_expires_at,last_error=null,updated_at=now()
  where id=p_attempt_id and status='creating' and stripe_checkout_session_id is null;
  return found;
end;
$$;

create or replace function public.membership_age_on(p_date_of_birth date,p_on_date date)
returns integer
language sql immutable strict
set search_path = ''
as $$
  select extract(year from age(p_on_date,p_date_of_birth))::integer;
$$;

create or replace function public.prepare_membership_age_transitions(p_membership_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if p_membership_year not between 2020 and 2200 then raise exception 'membership_transition_year_invalid'; end if;
  with candidates as (
    select member.id member_id,member.current_plan_id from_plan_id,target.id to_plan_id,
      case
        when current_plan.slug='junior' then 'Junior membership changes at age 18.'
        when current_plan.slug='student' then 'Student membership changes at age 25.'
        else 'Concession membership begins at age 80.' end summary
    from public.members member
    join public.membership_plans current_plan on current_plan.id=member.current_plan_id
    join public.membership_plans target on target.slug=case
      when current_plan.slug='junior' and public.membership_age_on(member.date_of_birth,make_date(p_membership_year,1,1))>=18 then 'adult'
      when current_plan.slug='student' and public.membership_age_on(member.date_of_birth,make_date(p_membership_year,1,1))>=25 then 'adult'
      when current_plan.slug='adult' and public.membership_age_on(member.date_of_birth,make_date(p_membership_year,1,1))>=80 then 'concession'
      else null end and target.active
    where member.date_of_birth is not null
      and member.effective_state in ('active','grace','payment_review','lapsed')
  ), inserted as (
    insert into public.membership_plan_transitions(
      member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on
    ) select member_id,p_membership_year,from_plan_id,to_plan_id,'age','scheduled',make_date(p_membership_year,1,1)
      from candidates
    on conflict(member_id,membership_year) do update set
      from_plan_id=excluded.from_plan_id,to_plan_id=excluded.to_plan_id,reason='age',
      status=case when public.membership_plan_transitions.status='applied' then 'applied' else 'scheduled' end,
      effective_on=excluded.effective_on,updated_at=now()
    returning member_id,to_plan_id
  )
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) select member.id,member.auth_user_id,member.contact_email,'membership.plan-transition',
    'Your next membership type',
    format('%s Your next membership year will use %s membership.',candidates.summary,target.name),
    case when member.auth_user_id is null then null else '/account' end,
    'membership-plan-transition-'||member.id::text||'-'||p_membership_year::text
  from inserted
  join candidates on candidates.member_id=inserted.member_id
  join public.members member on member.id=inserted.member_id
  join public.membership_plans target on target.id=inserted.to_plan_id
  on conflict(deduplication_key) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.apply_membership_plan_transitions(p_today date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with applied as (
    update public.membership_plan_transitions transition
    set status='applied',updated_at=now()
    where transition.status in ('scheduled','approved') and transition.effective_on<=p_today
      and not exists(select 1 from public.membership_terms term
        where term.member_id=transition.member_id and term.membership_year=transition.membership_year and term.status='paid')
    returning transition.member_id,transition.to_plan_id
  )
  update public.members member set current_plan_id=applied.to_plan_id,updated_at=now()
  from applied where member.id=applied.member_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.run_membership_launch_retention(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_applications integer:=0; v_members integer:=0;
begin
  update public.membership_applications application
  set full_name='Former applicant',title='',contact_email='expired+'||replace(application.id::text,'-','')||'@example.invalid',
      contact_number=null,date_of_birth=null,guardian_name=null,guardian_email=null,guardian_consent=false,
      verification_token_hash=encode(extensions.digest(application.id::text||':expired','sha256'),'hex'),
      guardian_verification_token_hash=null,application_status_token_hash=null,retention_anonymized_at=now(),updated_at=now()
  where application.status in ('rejected','expired') and application.retention_anonymized_at is null
    and application.updated_at < p_today::timestamptz - interval '90 days';
  get diagnostics v_applications=row_count;

  update public.members member
  set auth_user_id=null,title='',full_name='Former member · '||upper(left(replace(member.id::text,'-',''),8)),
      contact_email=null,contact_number=null,date_of_birth=null,guardian_name=null,guardian_email=null,
      guardian_consent_at=null,guardian_consent_note=null,postal_address=null,preferred_contact_method='officer',
      portal_invitation_status='not_requested',anonymized_at=now(),updated_at=now()
  where member.retention_until is not null and member.retention_until<p_today::timestamptz
    and not member.legal_hold and member.anonymized_at is null and member.effective_state='archived';
  get diagnostics v_members=row_count;
  return jsonb_build_object('applications',v_applications,'members',v_members);
end;
$$;

revoke all on function public.reserve_membership_checkout_attempt(text,uuid,uuid,integer,uuid,integer,boolean),
  public.attach_membership_checkout_session(uuid,text,timestamptz),
  public.prepare_membership_age_transitions(integer),public.apply_membership_plan_transitions(date),
  public.run_membership_launch_retention(date) from public,anon,authenticated;
grant execute on function public.reserve_membership_checkout_attempt(text,uuid,uuid,integer,uuid,integer,boolean),
  public.attach_membership_checkout_session(uuid,text,timestamptz),
  public.prepare_membership_age_transitions(integer),public.apply_membership_plan_transitions(date),
  public.run_membership_launch_retention(date) to service_role;

-- Shared emails are valid correspondence. Group them for portal review but do
-- not treat them as entitlement conflicts or auto-link them to Auth accounts.
update public.membership_migration_reviews review
set review_group_key='shared-email:'||lower(record.contact_email)
from public.membership_records record
where review.membership_record_id=record.id and review.review_kind='shared_email'
  and record.contact_email is not null and review.review_group_key is null;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='membership-launch-retention';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('membership-launch-retention','43 2 * * *','select public.run_membership_launch_retention(current_date)');
  select jobid into existing_job from cron.job where jobname='prepare-membership-age-transitions';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('prepare-membership-age-transitions','10 0 1 11 *','select public.prepare_membership_age_transitions(extract(year from current_date)::integer+1)');
end $$;
