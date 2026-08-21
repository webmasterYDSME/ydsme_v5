import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuredWorkdir = process.env.SUPABASE_TEST_WORKDIR;
assert.equal(
  configuredWorkdir,
  ".supabase-test",
  "Set SUPABASE_TEST_WORKDIR=.supabase-test for isolated local database tests.",
);

const testRoot = join(repositoryRoot, configuredWorkdir);
assert.equal(testRoot, join(repositoryRoot, ".supabase-test"));
rmSync(testRoot, { recursive: true, force: true });
mkdirSync(testRoot, { recursive: true });
cpSync(join(repositoryRoot, "supabase"), join(testRoot, "supabase"), { recursive: true });
rmSync(join(testRoot, "supabase", ".temp"), { recursive: true, force: true });
rmSync(join(testRoot, "supabase", ".branches"), { recursive: true, force: true });

const copiedConfig = readFileSync(join(testRoot, "supabase", "config.toml"), "utf8");
assert.match(
  copiedConfig,
  /\[api\][\s\S]*?port\s*=\s*55321/,
  "The isolated test stack must use http://127.0.0.1:55321.",
);

const migrationPath = join(
  testRoot,
  "supabase",
  "migrations",
  "202608180004_secure_dashboard.sql",
);
const rolloutGuard = `do $$
declare active_administrators integer;
begin
  select count(*)::integer into active_administrators
  from public.user_roles ur
  join public.users u on u.id = ur.user_id
  where ur.role = 'administrator' and u.membership_status = 'active';
  if active_administrators < 3 then
    raise exception 'Expected at least three active administrators before rollout; found %', active_administrators;
  end if;
end;
$$;`;
const migration = readFileSync(migrationPath, "utf8");
assert.equal(
  migration.split(rolloutGuard).length - 1,
  1,
  "The historical administrator rollout guard changed; review the local test bootstrap.",
);
writeFileSync(
  migrationPath,
  migration.replace(
    rolloutGuard,
    "-- Local CI starts from an empty database, so the production data rollout guard is not applicable.",
  ),
);

const result = spawnSync(
  "npx",
  ["supabase", "start", "--workdir", testRoot],
  { env: process.env, stdio: "inherit" },
);
if (result.status !== 0) {
  spawnSync(
    "npx",
    ["supabase", "stop", "--workdir", testRoot, "--no-backup"],
    { env: process.env, stdio: "inherit" },
  );
}
assert.equal(result.status, 0, "Unable to start the isolated local Supabase stack.");

const configuration = spawnSync(
  process.execPath,
  [join(repositoryRoot, "scripts", "configure-local-supabase.mjs")],
  {
    env: { ...process.env, SUPABASE_WORKDIR: testRoot },
    stdio: "inherit",
  },
);
assert.equal(configuration.status, 0, "Unable to configure the isolated local Supabase stack.");
