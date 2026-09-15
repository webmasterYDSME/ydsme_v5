import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { findVerification, markerName } from "../scripts/ci-reuse.mjs";

const tree = "a".repeat(40);
function fixture({ artifact = {}, run = {}, coverage = "full" } = {}) {
  const calls = [];
  const evidence = {
    name: markerName(tree, coverage), expired: false,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    workflow_run: { id: 21, repository_id: 10, head_repository_id: 10 }, ...artifact,
  };
  const options = {
    tree, integration: true, repository: "owner/repo", repositoryId: "10", runId: "22", attempt: "1",
    get: async (path) => {
      calls.push(path);
      if (path.endsWith("/workflows/ci.yml")) return { id: 5 };
      if (path.includes("/artifacts?")) return { artifacts: [evidence] };
      return {
        id: 21, workflow_id: 5, status: "completed", conclusion: "success", event: "pull_request",
        repository: { full_name: "owner/repo" }, head_repository: { full_name: "owner/repo" }, ...run,
      };
    },
  };
  return { options, calls };
}

test("identical tested tree is reusable across merge commits", async () => {
  assert.deepEqual(await findVerification(fixture().options), { runId: "21", coverage: "full" });
  const { options } = fixture();
  assert.equal(await findVerification({ ...options, tree: "b".repeat(40) }), null);
});

test("source-only verification cannot satisfy integration checks", async () => {
  const { options } = fixture({ coverage: "source" });
  assert.equal(await findVerification(options), null);
  assert.deepEqual(await findVerification({ ...options, integration: false }), { runId: "21", coverage: "source" });
});

test("failed, incomplete, foreign and unrelated workflows are never trusted", async () => {
  for (const run of [
    { conclusion: "failure" }, { conclusion: "cancelled" }, { status: "in_progress" },
    { workflow_id: 99 }, { event: "workflow_dispatch" }, { id: 99 },
    { repository: { full_name: "other/repo" } }, { head_repository: { full_name: "fork/repo" } },
  ]) assert.equal(await findVerification(fixture({ run }).options), null, JSON.stringify(run));
  for (const artifact of [
    { expired: true }, { expires_at: "invalid" }, { expires_at: "2020-01-01" },
    { workflow_run: { id: 22, repository_id: 10, head_repository_id: 10 } },
    { workflow_run: { id: 21, repository_id: 10, head_repository_id: 99 } },
    { workflow_run: { id: 21, repository_id: 99, head_repository_id: 10 } },
  ]) assert.equal(await findVerification(fixture({ artifact }).options), null, JSON.stringify(artifact));
});

test("missing evidence, API errors and reruns fall back to fresh checks", async () => {
  const { options, calls } = fixture();
  assert.equal(await findVerification({ ...options, attempt: "2" }), null);
  assert.equal(calls.length, 0);
  assert.equal(await findVerification({ ...options, get: async () => { throw new Error("403"); } }), null);
  assert.equal(await findVerification({ ...options, get: async () => ({}) }), null);
});

test("final CI gate rejects failed or unexpectedly skipped dependencies", () => {
  const yaml = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const gate = yaml.split("      - name: Require every selected check to pass")[1]
    .split("        run: |\n")[1].split("      - name:")[0];
  const good = { CHANGES: "success", PROMOTION: "success", MIGRATIONS: "success", MIGRATIONS_REQUIRED: "true", VERIFY: "success", INTEGRATION: "success", INTEGRATION_REQUIRED: "true", REUSED: "false" };
  const passes = (overrides) => spawnSync("bash", ["-c", gate], { env: { ...process.env, ...good, ...overrides } }).status === 0;
  assert.equal(passes({}), true);
  assert.equal(passes({ REUSED: "true", INTEGRATION: "skipped" }), true);
  assert.equal(passes({ MIGRATIONS_REQUIRED: "false", MIGRATIONS: "skipped", INTEGRATION_REQUIRED: "false", INTEGRATION: "skipped" }), true);
  for (const dependency of ["CHANGES", "PROMOTION", "MIGRATIONS", "VERIFY", "INTEGRATION"]) {
    for (const status of ["failure", "cancelled", "skipped"]) assert.equal(passes({ [dependency]: status }), false, `${dependency}: ${status}`);
  }
});
