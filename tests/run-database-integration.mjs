import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

const journeyPassword = process.env.JOURNEY_TEST_PASSWORD;
assert.ok(journeyPassword && journeyPassword.length >= 12, "Set JOURNEY_TEST_PASSWORD (12+ characters).");
readLocalSupabaseEnvironment("Database integration tests");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.input ? "utf8" : undefined,
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    env: { ...process.env, JOURNEY_TEST_PASSWORD: journeyPassword },
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed.`);
}

const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(projectId, "Unable to identify the local Supabase project.");

let fixturesCreated = false;
try {
  const localTests = [
    "tests/administrator-bootstrap.local.test.mjs",
    "tests/membermojo-apply.local.test.mjs",
    "tests/membermojo-list-import.local.test.mjs",
    "tests/membermojo-invitation-run.local.test.mjs",
    "tests/member-newsletter-preference.local.test.mjs",
    "tests/membership-price-carry-forward.local.test.mjs",
    "tests/membership-plan-view-security.local.test.mjs",
    "tests/membership-offline.local.test.mjs",
    "tests/membership-edge-cases.local.test.mjs",
    "tests/membership-platform.local.test.mjs",
    "tests/membership-simplified.local.test.mjs",
    "tests/membership-checkout-cutoff.local.test.mjs",
    "tests/membership-payment-settings.local.test.mjs",
    "tests/membership-review-fixes.local.test.mjs",
    "tests/membership-retention-and-reminders.local.test.mjs",
    "tests/public-project-featuring.local.test.mjs",
  ];
  run(process.execPath, ["--experimental-strip-types", "--test", ...localTests]);

  run(process.execPath, ["tests/journey-fixtures.mjs", "setup"]);
  fixturesCreated = true;
  run(process.execPath, ["tests/journey-fixtures.mjs", "verify"]);

  const databaseContract = readFileSync(new URL("./database-contract.sql", import.meta.url), "utf8");
  run(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: databaseContract },
  );
  run(process.execPath, ["tests/concurrency-contract.mjs"]);
} finally {
  if (fixturesCreated) {
    run(process.execPath, ["tests/journey-fixtures.mjs", "cleanup"]);
  }
}
