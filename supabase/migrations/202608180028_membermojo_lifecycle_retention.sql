-- Phase 3A: lifecycle and retention for imported membership records.
-- A complete_active_snapshot is an administrator assertion that records absent
-- from the file are no longer active. Portal access is never changed here.

alter table public.membership_records
  add column portal_access_review_required boolean not null default false;

create index membership_records_portal_review_idx
  on public.membership_records (updated_at)
  where portal_access_review_required;

comment on column public.membership_records.portal_access_review_required is
  'True when an ended imported membership is linked to a portal account that requires a human access review.';

create or replace function public.reconcile_membermojo_import_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ended integer := 0;
  v_restored integer := 0;
  v_portal_reviews integer := 0;
  v_now timestamptz := coalesce(new.applied_at, now());
begin
  -- An explicit Active row is sufficient to restore membership lifecycle
  -- state, but it never restores or otherwise changes portal access.
  update public.membership_records
  set membership_ended_at = null,
      retention_until = null,
      portal_access_review_required = false,
      updated_at = v_now
  where source = 'membermojo'
    and last_seen_import_id = new.id
    and lower(source_state) = 'active'
    and membership_ended_at is not null;
  get diagnostics v_restored = row_count;

  if new.import_mode = 'complete_active_snapshot' then
    update public.membership_records
    set membership_ended_at = v_now,
        retention_until = v_now + interval '12 months',
        portal_access_review_required = auth_user_id is not null,
        updated_at = v_now
    where source = 'membermojo'
      and last_seen_import_id is distinct from new.id
      and membership_ended_at is null;
    get diagnostics v_ended = row_count;

    select count(*) into v_portal_reviews
    from public.membership_records
    where source = 'membermojo'
      and membership_ended_at = v_now
      and portal_access_review_required;
  end if;

  update public.membership_imports
  set summary = summary || jsonb_build_object(
    'lifecycle', jsonb_build_object(
      'ended', v_ended,
      'restored', v_restored,
      'portal_access_reviews', v_portal_reviews,
      'retention_months', 12,
      'portal_accounts_changed', 0
    )
  )
  where id = new.id;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    after_state
  ) values (
    new.created_by,
    'administrator',
    'membermojo.lifecycle-reconciled',
    'membership_import',
    new.id::text,
    format(
      'Membership lifecycle reconciliation marked %s ended and %s restored; %s linked portal accounts require human review.',
      v_ended,
      v_restored,
      v_portal_reviews
    ),
    jsonb_build_object(
      'mode', new.import_mode,
      'ended', v_ended,
      'restored', v_restored,
      'portal_access_reviews', v_portal_reviews,
      'retention_months', 12,
      'portal_accounts_changed', 0
    )
  );

  return new;
end;
$$;

revoke all on function public.reconcile_membermojo_import_lifecycle()
  from public, anon, authenticated;

drop trigger if exists reconcile_membermojo_import_lifecycle on public.membership_imports;
create trigger reconcile_membermojo_import_lifecycle
after update of status on public.membership_imports
for each row
when (old.status is distinct from new.status and new.status = 'applied')
execute function public.reconcile_membermojo_import_lifecycle();

-- V2 exposes lifecycle counts after the V1 atomic apply has fired the
-- reconciliation trigger. Calling V1 and reading the summary remain inside
-- this function's transaction.
create or replace function public.apply_membermojo_membership_import_v2(
  p_import_id uuid,
  p_actor_id uuid,
  p_file_sha256 text,
  p_records jsonb
)
returns table (
  processed_count integer,
  created_count integer,
  refreshed_count integer,
  ended_count integer,
  restored_count integer,
  portal_access_review_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_applied record;
  v_lifecycle jsonb;
begin
  select * into v_applied
  from public.apply_membermojo_membership_import(
    p_import_id,
    p_actor_id,
    p_file_sha256,
    p_records
  );

  select summary->'lifecycle' into v_lifecycle
  from public.membership_imports
  where id = p_import_id;

  return query select
    v_applied.processed_count,
    v_applied.created_count,
    v_applied.refreshed_count,
    coalesce((v_lifecycle->>'ended')::integer, 0),
    coalesce((v_lifecycle->>'restored')::integer, 0),
    coalesce((v_lifecycle->>'portal_access_reviews')::integer, 0);
end;
$$;

revoke all on function public.apply_membermojo_membership_import_v2(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_membermojo_membership_import_v2(uuid, uuid, text, jsonb)
  to service_role;

-- Extend the scheduled retention job. Expired unlinked membership records can
-- be deleted safely in SQL. Linked portal accounts and legal holds are counted
-- for human review and deliberately retained.
create or replace function public.run_dashboard_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  anonymized integer;
  cleared_limits integer;
  cleared_abuse_summaries integer;
  cleared_import_previews integer;
  deleted_membership_records integer;
  linked_membership_records integer;
  held_membership_records integer;
begin
  update public.event_bookings eb
  set lead_name = 'Anonymised visitor',
      email = concat('anonymised+', eb.id::text, '@invalid.local'),
      confirmation_email_error = null,
      booking_device_hash = null,
      booking_ip_hash = null,
      anonymized_at = now(),
      updated_at = now()
  from public.events e
  where eb.event_id = e.id
    and eb.anonymized_at is null
    and e.end_date < current_date - 90;
  get diagnostics anonymized = row_count;

  delete from public.event_booking_abuse_summary summary
  using public.events e
  where summary.event_id = e.id
    and e.end_date < current_date - 90;
  get diagnostics cleared_abuse_summaries = row_count;

  delete from public.rate_limits where expires_at < now();
  get diagnostics cleared_limits = row_count;

  delete from public.membership_imports
  where status in ('previewed', 'rejected', 'expired')
    and expires_at < now();
  get diagnostics cleared_import_previews = row_count;

  delete from public.membership_records
  where retention_until < now()
    and not legal_hold
    and auth_user_id is null;
  get diagnostics deleted_membership_records = row_count;

  select count(*) into linked_membership_records
  from public.membership_records
  where retention_until < now()
    and not legal_hold
    and auth_user_id is not null;

  select count(*) into held_membership_records
  from public.membership_records
  where retention_until < now()
    and legal_hold;

  return jsonb_build_object(
    'bookings_anonymized', anonymized,
    'booking_abuse_summaries_cleared', cleared_abuse_summaries,
    'rate_limits_cleared', cleared_limits,
    'import_previews_cleared', cleared_import_previews,
    'membership_records_deleted', deleted_membership_records,
    'membership_records_awaiting_portal_review', linked_membership_records,
    'membership_records_on_legal_hold', held_membership_records
  );
end;
$$;

revoke all on function public.run_dashboard_retention() from public, anon, authenticated;
grant execute on function public.run_dashboard_retention() to service_role;
