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
  perform set_config('app.membermojo_test_actor', v_actor::text, true);
end;
$setup$;

set local role service_role;

do $test$
declare
  v_actor uuid;
  v_import uuid;
  v_second_import uuid;
  v_changed_import uuid;
  v_null_import uuid;
  v_processed integer;
  v_created integer;
  v_refreshed integer;
  v_users_before bigint;
  v_roles_before bigint;
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
  if has_function_privilege('authenticated', 'public.apply_membermojo_membership_import(uuid,uuid,text,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.apply_membermojo_membership_import(uuid,uuid,text,jsonb)', 'execute') then
    raise exception 'MemberMojo apply function privileges are unsafe';
  end if;

  v_actor := current_setting('app.membermojo_test_actor')::uuid;
  if exists (
    select 1 from public.membership_records
    where external_id in ('90000000000000000001', '90000000000000000002')
  ) then
    raise exception 'Synthetic test IDs unexpectedly exist';
  end if;

  select count(*) into v_users_before from public.users;
  select count(*) into v_roles_before from public.user_roles;

  select import_id into v_import
  from public.register_membermojo_import_preview(
    repeat('a', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count
  into v_processed, v_created, v_refreshed
  from public.apply_membermojo_membership_import(v_import, v_actor, repeat('a', 64), v_records);
  if (v_processed, v_created, v_refreshed) is distinct from (2, 2, 0) then
    raise exception 'Unexpected first apply counts: %, %, %', v_processed, v_created, v_refreshed;
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
  v_records := jsonb_set(v_records, '{0,first_name}', '"Refreshed"'::jsonb);
  select import_id into v_second_import
  from public.register_membermojo_import_preview(
    repeat('b', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  select processed_count, created_count, refreshed_count
  into v_processed, v_created, v_refreshed
  from public.apply_membermojo_membership_import(v_second_import, v_actor, repeat('b', 64), v_records);
  if (v_processed, v_created, v_refreshed) is distinct from (2, 0, 2) then
    raise exception 'Unexpected refresh counts: %, %, %', v_processed, v_created, v_refreshed;
  end if;
  if not exists (
    select 1 from public.membership_records
    where external_id = '90000000000000000001'
      and first_name = 'Refreshed'
      and membership_ended_at = '2026-01-01T00:00:00Z'
      and retention_until = '2028-01-01T00:00:00Z'
      and auth_user_id = v_actor
  ) then
    raise exception 'Import did not preserve lifecycle fields while refreshing source data';
  end if;

  begin
    perform public.apply_membermojo_membership_import(v_second_import, v_actor, repeat('b', 64), v_records);
    raise exception 'Expected repeated import to fail';
  exception when others then
    if sqlerrm not like '%membermojo_import_already_applied%' then raise; end if;
  end;

  select import_id into v_changed_import
  from public.register_membermojo_import_preview(
    repeat('c', 64), 'update_only', 'utf-8', 2,
    '{"totals":{"uploadedRows":2}}'::jsonb, v_actor
  );
  begin
    perform public.apply_membermojo_membership_import(v_changed_import, v_actor, repeat('d', 64), v_records);
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
    perform public.apply_membermojo_membership_import(v_null_import, v_actor, repeat('e', 64), null);
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
