import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
