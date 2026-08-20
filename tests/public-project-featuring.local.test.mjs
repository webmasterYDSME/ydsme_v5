import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("keeps public project featuring consented, reviewed and revocable on loopback Supabase", t => {
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
  v_owner uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner, 'authenticated', 'authenticated', 'public-feature-owner-' || v_owner::text || '@example.invalid', now(), '{"full_name":"Synthetic Project Owner"}'::jsonb, now(), now()),
    (v_reviewer, 'authenticated', 'authenticated', 'public-feature-reviewer-' || v_reviewer::text || '@example.invalid', now(), '{"full_name":"Synthetic Committee Reviewer"}'::jsonb, now(), now());

  update public.users set membership_status = 'active' where id in (v_owner, v_reviewer);
  update public.user_roles set role = 'committee' where user_id = v_reviewer;

  insert into public.member_projects (id, owner_id, title, summary, category, project_status, completed_at)
  values (v_project, v_owner, 'Synthetic public feature', 'A completed project used only by the local public featuring contract test.', 'other', 'completed', now());
  insert into public.member_project_updates (project_id, author_id, title, body)
  values (v_project, v_owner, 'Finished assembly', 'The final assembly and checks were completed successfully.');
  insert into public.member_project_comments (project_id, author_id, body)
  values (v_project, v_reviewer, 'This private member comment must never enter the public snapshot.');

  perform set_config('app.public_feature_owner', v_owner::text, true);
  perform set_config('app.public_feature_reviewer', v_reviewer::text, true);
  perform set_config('app.public_feature_project', v_project::text, true);
end;
$setup$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_owner'), true);
select public.request_public_project_feature(current_setting('app.public_feature_project')::uuid, false);
reset role;

do $self_review$
begin
  begin
    update public.member_project_feature_requests
    set status = 'approved',
        reviewed_by = current_setting('app.public_feature_owner')::uuid,
        reviewed_at = now()
    where project_id = current_setting('app.public_feature_project')::uuid;
    raise exception 'Expected self-review to fail';
  exception when others then
    if sqlerrm not like '%public_feature_requires_independent_review%' then raise; end if;
  end;
end;
$self_review$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_reviewer'), true);
select public.approve_public_project_feature(
  current_setting('app.public_feature_project')::uuid,
  null,
  '{}'::jsonb,
  'Synthetic independent approval'
);
reset role;

do $approved_check$
begin
  if not exists (
    select 1
    from public.public_featured_projects
    where project_id = current_setting('app.public_feature_project')::uuid
      and owner_byline = 'York Model Engineers member'
  ) or not exists (
    select 1
    from public.public_featured_project_updates
    where project_id = current_setting('app.public_feature_project')::uuid
      and title = 'Finished assembly'
  ) then
    raise exception 'Approved public snapshot was not created';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('public_featured_projects', 'public_featured_project_updates', 'public_featured_project_photos')
      and column_name in ('owner_id', 'author_id', 'email', 'body_address', 'comment_id')
  ) then
    raise exception 'Public snapshot schema exposes member identifiers';
  end if;
end;
$approved_check$;

set local role anon;
select count(*) from public.public_featured_projects
where project_id = current_setting('app.public_feature_project')::uuid;
reset role;

update public.member_projects
set summary = 'An approved content edit that must return the feature to committee review.'
where id = current_setting('app.public_feature_project')::uuid;

do $invalidation_check$
begin
  if exists (
    select 1 from public.public_featured_projects
    where project_id = current_setting('app.public_feature_project')::uuid
  ) or not exists (
    select 1 from public.member_project_feature_requests
    where project_id = current_setting('app.public_feature_project')::uuid
      and status = 'pending'
      and owner_consented_at is not null
  ) then
    raise exception 'Editing approved content did not unpublish it for re-review';
  end if;
end;
$invalidation_check$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_reviewer'), true);
select public.approve_public_project_feature(
  current_setting('app.public_feature_project')::uuid,
  null,
  '{}'::jsonb,
  'Synthetic re-approval'
);
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_owner'), true);
select public.withdraw_public_project_feature(current_setting('app.public_feature_project')::uuid);
reset role;

do $withdrawal_check$
begin
  if exists (
    select 1 from public.public_featured_projects
    where project_id = current_setting('app.public_feature_project')::uuid
  ) or not exists (
    select 1 from public.member_project_feature_requests
    where project_id = current_setting('app.public_feature_project')::uuid
      and status = 'withdrawn'
      and owner_consented_at is null
  ) then
    raise exception 'Owner withdrawal did not remove the public snapshot';
  end if;
end;
$withdrawal_check$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_owner'), true);
select public.request_public_project_feature(current_setting('app.public_feature_project')::uuid, false);
select set_config('request.jwt.claim.sub', current_setting('app.public_feature_reviewer'), true);
select public.approve_public_project_feature(
  current_setting('app.public_feature_project')::uuid,
  null,
  '{}'::jsonb,
  'Synthetic approval before owner deletion'
);
reset role;

update public.member_projects
set owner_id = null
where id = current_setting('app.public_feature_project')::uuid;

do $former_member_check$
begin
  if exists (
    select 1 from public.public_featured_projects
    where project_id = current_setting('app.public_feature_project')::uuid
  ) or not exists (
    select 1 from public.member_project_feature_requests
    where project_id = current_setting('app.public_feature_project')::uuid
      and status = 'withdrawn'
      and owner_consented_at is null
  ) then
    raise exception 'Removing project ownership did not withdraw the public feature safely';
  end if;
end;
$former_member_check$;

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
