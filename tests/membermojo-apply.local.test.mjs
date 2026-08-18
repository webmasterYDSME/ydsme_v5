import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("applies MemberMojo records atomically on loopback Supabase", t => {
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  if (status.status !== 0) {
    t.skip("Local Supabase is not running.");
    return;
  }
  const apiUrl = status.stdout.match(/^API_URL="([^"]+)"$/m)?.[1];
  assert.ok(apiUrl, "Supabase status did not return API_URL.");
  const endpoint = new URL(apiUrl);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname), `Refusing data-writing test against ${endpoint.hostname}.`);

  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId, "Unable to identify the local Supabase project.");

  const sql = String.raw`
begin;

do $setup$
declare
  v_actor uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at
  ) values (
    v_actor,
    'authenticated',
    'authenticated',
    'membermojo-import-test-' || v_actor::text || '@example.invalid',
    now(),
    '{"full_name":"Synthetic Import Administrator"}'::jsonb,
    now(),
    now()
  );
  update public.users set membership_status = 'active' where id = v_actor;
  update public.user_roles set role = 'administrator' where user_id = v_actor;
  insert into auth.users (
    id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at
  ) values (
    v_member,
    'authenticated',
    'authenticated',
    'membermojo-import-member-' || v_member::text || '@example.invalid',
    now(),
    '{"full_name":"Synthetic Import Member"}'::jsonb,
    now(),
    now()
  );
  perform set_config('app.membermojo_test_actor', v_actor::text, true);
  perform set_config('app.membermojo_test_member', v_member::text, true);
end;
$setup$;

set local role service_role;

do $test$
declare
  v_actor uuid;
  v_member uuid;
  v_import uuid;
  v_second_import uuid;
  v_snapshot_import uuid;
  v_member_snapshot_import uuid;
  v_changed_import uuid;
  v_null_import uuid;
  v_processed integer;
  v_created integer;
  v_refreshed integer;
  v_ended integer;
  v_restored integer;
  v_reviews integer;
  v_retention jsonb;
  v_claimed_user uuid;
  v_claim_token uuid;
  v_users_before bigint;
  v_roles_before bigint;
  v_active_baseline integer;
  v_linked_baseline integer;
  v_records jsonb := jsonb_build_array(
    jsonb_build_object(
      'external_id', '90000000000000000001',
      'title', 'Ms',
      'first_name', 'Synthetic',
      'last_name', 'One',
      'contact_email', 'synthetic-one@example.invalid',
      'membership_type', 'Adult member',
      'source_state', 'Active',
      'source_expires_on', '2027-01-31',
      'source_renewed_on', '2026-02-01',
      'source_member_since', '2020-01-01',
      'source_rules_agreement', true
    ),
    jsonb_build_object(
      'external_id', '90000000000000000002',
      'title', 'Mr',
      'first_name', 'Synthetic',
      'last_name', 'Two',
      'contact_email', null,
      'membership_type', 'Adult member',
      'source_state', 'Active',
      'source_expires_on', '2027-01-31',
      'source_renewed_on', null,
      'source_member_since', '2021-01-01',
      'source_rules_agreement', false
    )
  );
begin
  if has_function_privilege('authenticated', 'public.apply_membermojo_membership_import_v2(uuid,uuid,text,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.apply_membermojo_membership_import_v2(uuid,uuid,text,jsonb)', 'execute') then
    raise exception 'MemberMojo apply function privileges are unsafe';
  end if;
  if has_function_privilege('authenticated', 'public.claim_expired_portal_accounts(integer)', 'execute')
    or not has_function_privilege('service_role', 'public.claim_expired_portal_accounts(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.release_expired_portal_account_claim(uuid,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.release_expired_portal_account_claim(uuid,uuid,text)', 'execute') then
    raise exception 'Expired portal-account purge privileges are unsafe';
  end if;
  if has_function_privilege('authenticated', 'public.anonymize_member_content_for_purge(uuid,uuid,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.anonymize_member_content_for_purge(uuid,uuid,uuid)', 'execute') then
    raise exception 'Member-content anonymisation privileges are unsafe';
  end if;

  v_actor := current_setting('app.membermojo_test_actor')::uuid;
  v_member := current_setting('app.membermojo_test_member')::uuid;
  if exists (
    select 1 from public.membership_records
    where external_id in ('90000000000000000001', '90000000000000000002', '90000000000000000003', '90000000000000000004')
  ) then
    raise exception 'Synthetic test IDs unexpectedly exist';
  end if;

  select count(*) into v_users_before from public.users;
  select count(*) into v_roles_before from public.user_roles;
  select count(*) into v_active_baseline
  from public.membership_records
  where source = 'membermojo' and membership_ended_at is null;
  select count(*) into v_linked_baseline
  from public.membership_records
  where source = 'membermojo' and membership_ended_at is null and auth_user_id is not null;

  select import_id into v_import
  from public.register_membermojo_import_preview(
    repeat('a', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count, ended_count, restored_count, portal_access_review_count
  into v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews
  from public.apply_membermojo_membership_import_v2(v_import, v_actor, repeat('a', 64), v_records);
  if (v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews) is distinct from (2, 2, 0, 0, 0, 0) then
    raise exception 'Unexpected first apply counts: %, %, %, %, %, %', v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews;
  end if;
  if not exists (
    select 1 from public.audit_logs
    where entity_id = v_import::text and action = 'membermojo.import-applied'
  ) then
    raise exception 'Atomic audit record is missing';
  end if;

  update public.membership_records
  set membership_ended_at = '2026-01-01T00:00:00Z',
      retention_until = '2028-01-01T00:00:00Z',
      auth_user_id = v_actor
  where external_id = '90000000000000000001';
  update public.membership_records
  set auth_user_id = v_member
  where external_id = '90000000000000000002';
  v_records := jsonb_set(v_records, '{0,first_name}', '"Refreshed"'::jsonb);
  select import_id into v_second_import
  from public.register_membermojo_import_preview(
    repeat('b', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count, ended_count, restored_count, portal_access_review_count
  into v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews
  from public.apply_membermojo_membership_import_v2(v_second_import, v_actor, repeat('b', 64), v_records);
  if (v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews) is distinct from (2, 0, 2, 0, 1, 0) then
    raise exception 'Unexpected refresh counts: %, %, %, %, %, %', v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews;
  end if;
  if not exists (
    select 1 from public.membership_records
    where external_id = '90000000000000000001'
      and first_name = 'Refreshed'
      and membership_ended_at is null
      and retention_until is null
      and auth_user_id = v_actor
  ) then
    raise exception 'Explicit Active source data did not restore lifecycle state while preserving the portal link';
  end if;

  begin
    perform public.apply_membermojo_membership_import_v2(v_second_import, v_actor, repeat('b', 64), v_records);
    raise exception 'Expected repeated import to fail';
  exception when others then
    if sqlerrm not like '%membermojo_import_already_applied%' then raise; end if;
  end;

  select import_id into v_snapshot_import
  from public.register_membermojo_import_preview(
    repeat('f', 64), 'complete_active_snapshot', 'utf-8', 1,
    '{"totals":{"uploadedRows":1}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count, ended_count, restored_count, portal_access_review_count
  into v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews
  from public.apply_membermojo_membership_import_v2(
    v_snapshot_import, v_actor, repeat('f', 64), jsonb_build_array(v_records->1)
  );
  if (v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews)
    is distinct from (1, 0, 1, v_active_baseline + 1, 0, v_linked_baseline + 1) then
    raise exception 'Unexpected complete snapshot counts: %, %, %, %, %, %', v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews;
  end if;
  if not exists (
    select 1 from public.membership_records mr
    join public.users u on u.id = mr.auth_user_id
    where mr.external_id = '90000000000000000001'
      and mr.membership_ended_at is not null
      and mr.retention_until = mr.membership_ended_at + interval '12 months'
      and mr.portal_access_review_required
      and u.membership_status = 'active'
  ) then
    raise exception 'Complete snapshot did not retain and flag the absent linked membership without changing portal access';
  end if;

  begin
    perform public.resolve_membermojo_portal_access_review(
      (select id from public.membership_records where external_id = '90000000000000000001'),
      v_actor,
      'archive_access',
      'Synthetic self-archive protection check.'
    );
    raise exception 'Expected self archive review to fail';
  exception when others then
    if sqlerrm not like '%membermojo_portal_review_self%' then raise; end if;
  end;

  perform public.resolve_membermojo_portal_access_review(
    (select id from public.membership_records where external_id = '90000000000000000001'),
    v_actor,
    'retain_access',
    'Synthetic operational exception pending MemberMojo correction.'
  );
  if not exists (
    select 1 from public.membership_records mr
    join public.users u on u.id = mr.auth_user_id
    where mr.external_id = '90000000000000000001'
      and not mr.portal_access_review_required
      and mr.portal_access_review_decision = 'retain_access'
      and mr.portal_access_reviewed_by = v_actor
      and mr.retention_until >= mr.portal_access_reviewed_at + interval '12 months'
      and u.membership_status = 'active'
  ) then
    raise exception 'Retain-access review was not recorded with a bounded extension and unchanged portal access';
  end if;

  update public.membership_records
  set retention_until = now() - interval '1 day'
  where external_id = '90000000000000000001';
  v_retention := public.run_dashboard_retention();
  if not exists (
    select 1 from public.membership_records
    where external_id = '90000000000000000001'
      and portal_access_review_required
      and portal_access_review_decision is null
  ) or (v_retention->>'membership_records_portal_reviews_reopened')::integer < 1 then
    raise exception 'Expired retained access did not return to the human review queue: %', v_retention;
  end if;

  select import_id into v_member_snapshot_import
  from public.register_membermojo_import_preview(
    repeat('9', 64), 'complete_active_snapshot', 'utf-8', 1,
    '{"totals":{"uploadedRows":1}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count, ended_count, restored_count, portal_access_review_count
  into v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews
  from public.apply_membermojo_membership_import_v2(
    v_member_snapshot_import, v_actor, repeat('9', 64), jsonb_build_array(v_records->0)
  );
  if (v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews) is distinct from (1, 0, 1, 1, 1, 1) then
    raise exception 'Unexpected second complete snapshot counts: %, %, %, %, %, %', v_processed, v_created, v_refreshed, v_ended, v_restored, v_reviews;
  end if;
  if not exists (
    select 1 from public.membership_records
    where external_id = '90000000000000000001'
      and membership_ended_at is null
      and portal_access_review_decision is null
  ) then
    raise exception 'Active restoration did not clear the prior portal review resolution';
  end if;

  perform public.resolve_membermojo_portal_access_review(
    (select id from public.membership_records where external_id = '90000000000000000002'),
    v_actor,
    'archive_access',
    'Membership ended after confirmed complete active-member snapshot.'
  );
  if not exists (
    select 1 from public.membership_records mr
    join public.users u on u.id = mr.auth_user_id
    where mr.external_id = '90000000000000000002'
      and not mr.portal_access_review_required
      and mr.portal_access_review_decision = 'archive_access'
      and u.membership_status = 'archived'
  ) then
    raise exception 'Archive-access review did not archive the portal profile while preserving Auth';
  end if;

  update public.membership_records
  set retention_until = now() - interval '1 day'
  where external_id = '90000000000000000002';
  update public.users
  set retention_until = now() - interval '100 years'
  where id = v_member;
  insert into public.membership_records (
    external_id, first_name, last_name, membership_type, source_state,
    membership_ended_at, retention_until
  ) values (
    '90000000000000000003', 'Synthetic', 'Unlinked', 'Adult member', 'Ended',
    now() - interval '13 months', now() - interval '1 day'
  );
  insert into public.membership_records (
    external_id, first_name, last_name, membership_type, source_state,
    membership_ended_at, retention_until, legal_hold, legal_hold_reason
  ) values (
    '90000000000000000004', 'Synthetic', 'Held', 'Adult member', 'Ended',
    now() - interval '13 months', now() - interval '1 day', true, 'Synthetic contract test hold'
  );
  v_retention := public.run_dashboard_retention();
  if exists (select 1 from public.membership_records where external_id = '90000000000000000003') then
    raise exception 'Expired unlinked membership was not deleted';
  end if;
  if not exists (select 1 from public.membership_records where external_id = '90000000000000000002' and auth_user_id = v_member)
    or not exists (select 1 from public.membership_records where external_id = '90000000000000000004' and legal_hold) then
    raise exception 'Linked or legally held expired membership was deleted';
  end if;
  if (v_retention->>'membership_records_deleted')::integer < 1
    or (v_retention->>'membership_records_expired_but_linked')::integer < 1
    or (v_retention->>'portal_accounts_ready_for_purge')::integer < 1
    or (v_retention->>'membership_records_on_legal_hold')::integer < 1 then
    raise exception 'Retention result did not report deleted and retained membership records: %', v_retention;
  end if;

  update public.users set legal_hold = true where id = v_member;
  if exists (select 1 from public.claim_expired_portal_accounts(100) where user_id = v_member) then
    raise exception 'Legal hold did not exclude an expired portal account from purge claims';
  end if;
  update public.users set legal_hold = false where id = v_member;

  select user_id, claim_token into v_claimed_user, v_claim_token
  from public.claim_expired_portal_accounts(100)
  where user_id = v_member;
  if v_claimed_user is distinct from v_member or v_claim_token is null then
    raise exception 'Eligible expired portal account was not claimed';
  end if;
  begin
    update public.users set membership_status = 'active' where id = v_member;
    raise exception 'Expected restore during purge claim to fail';
  exception when others then
    if sqlerrm not like '%member_retention_purge_in_progress%' then raise; end if;
  end;
  insert into public.feeds (type, message, author_name, author_id)
  values ('message', 'Synthetic historical message', 'Synthetic Import Member', v_member);
  if not public.anonymize_member_content_for_purge(v_member, v_claim_token, null) then
    raise exception 'Claimed member content was not anonymised';
  end if;
  if not exists (
    select 1 from public.feeds
    where message = 'Synthetic historical message'
      and author_id is null
      and author_name = 'Former member'
  ) then
    raise exception 'Direct feed authorship survived retention anonymisation';
  end if;
  if not public.release_expired_portal_account_claim(v_member, v_claim_token, 'Synthetic Auth deletion failure') then
    raise exception 'Failed purge claim was not released';
  end if;
  if not exists (
    select 1 from public.users
    where id = v_member
      and retention_purge_claim_token is null
      and retention_purge_attempts = 1
      and retention_purge_last_error = 'Synthetic Auth deletion failure'
  ) or not exists (
    select 1 from public.audit_logs
    where entity_id = v_member::text and action = 'member.retention-purge-failed'
  ) then
    raise exception 'Purge retry state or failure audit was not recorded';
  end if;
  update public.membership_records
  set legal_hold = true,
      legal_hold_reason = 'Synthetic linked membership deletion hold'
  where external_id = '90000000000000000002';
  begin
    perform public.anonymize_member_content_for_purge(v_member, null, v_actor);
    raise exception 'Expected linked membership legal hold to block manual purge';
  exception when others then
    if sqlerrm not like '%member_purge_unavailable%' then raise; end if;
  end;
  update public.membership_records
  set legal_hold = false,
      legal_hold_reason = null
  where external_id = '90000000000000000002';

  select import_id into v_changed_import
  from public.register_membermojo_import_preview(
    repeat('c', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  begin
    perform public.apply_membermojo_membership_import_v2(v_changed_import, v_actor, repeat('d', 64), v_records);
    raise exception 'Expected changed file to fail';
  exception when others then
    if sqlerrm not like '%membermojo_file_changed%' then raise; end if;
  end;

  select import_id into v_null_import
  from public.register_membermojo_import_preview(
    repeat('e', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  begin
    perform public.apply_membermojo_membership_import_v2(v_null_import, v_actor, repeat('e', 64), null);
    raise exception 'Expected null records to fail';
  exception when others then
    if sqlerrm not like '%membermojo_records_invalid%' then raise; end if;
  end;
  if (select status from public.membership_imports where id = v_null_import) <> 'previewed' then
    raise exception 'Invalid payload changed import state';
  end if;

  if (select count(*) from public.users) <> v_users_before
    or (select count(*) from public.user_roles) <> v_roles_before then
    raise exception 'Portal accounts or roles changed';
  end if;
end;
$test$;

rollback;
`;

  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ROLLBACK/);
});
