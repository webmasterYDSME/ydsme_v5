import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
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
const result = spawnSync(
  "npx",
  ["supabase", "stop", "--workdir", testRoot, "--no-backup"],
  { env: process.env, stdio: "inherit" },
);
rmSync(testRoot, { recursive: true, force: true });
assert.equal(result.status, 0, "Unable to stop the isolated local Supabase stack.");
