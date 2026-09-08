import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("bootstraps exactly one verified administrator on a new installation", (t) => {
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  if (status.status !== 0) return t.skip("Local Supabase is not running.");
  const apiUrl = status.stdout.match(/^API_URL="([^"]+)"$/m)?.[1];
  assert.ok(apiUrl);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(new URL(apiUrl).hostname));
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId);

  const sql = String.raw`
begin;
do $test$
declare
  v_user_id uuid := gen_random_uuid();
  v_unverified_user_id uuid := gen_random_uuid();
  v_result uuid;
begin
  update public.user_roles set role = 'member' where role = 'administrator';

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(
    v_unverified_user_id,
    'authenticated',
    'authenticated',
    'unverified-bootstrap-' || v_unverified_user_id || '@example.invalid',
    null,
    '{"full_name":"Unverified Bootstrap User"}',
    now(),
    now()
  );
  begin
    perform public.bootstrap_first_administrator(v_unverified_user_id);
    raise exception 'Unverified administrator bootstrap was accepted';
  exception when others then
    if sqlerrm not like '%administrator_bootstrap_email_not_verified%' then raise; end if;
  end;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(
    v_user_id,
    'authenticated',
    'authenticated',
    'verified-bootstrap-' || v_user_id || '@example.invalid',
    now(),
    '{"full_name":"Verified Bootstrap User"}',
    now(),
    now()
  );
  update public.users set membership_status = 'archived', retention_until = now() + interval '12 months'
  where id = v_user_id;

  select public.bootstrap_first_administrator(v_user_id) into v_result;
  if v_result <> v_user_id then raise exception 'Bootstrap returned the wrong user'; end if;
  if not exists(
    select 1
    from public.user_roles role_record
    join public.users user_record on user_record.id = role_record.user_id
    where role_record.user_id = v_user_id
      and role_record.role = 'administrator'
      and user_record.membership_status = 'active'
      and user_record.retention_until is null
  ) then raise exception 'Verified user was not activated as administrator'; end if;
  if not exists(
    select 1 from public.audit_logs
    where action = 'administrator.bootstrap' and entity_id = v_user_id::text
  ) then raise exception 'Administrator bootstrap was not audited'; end if;

  begin
    perform public.bootstrap_first_administrator(v_unverified_user_id);
    raise exception 'A second administrator bootstrap was accepted';
  exception when others then
    if sqlerrm not like '%administrator_bootstrap_already_completed%' then raise; end if;
  end;
end;
$test$;
rollback;
`;

  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: sql },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
