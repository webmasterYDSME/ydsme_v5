import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("runs staged verification, migration and deployment automation", async () => {
  const [
    packageSource,
    vercelSource,
    workflow,
    releaseWorkflow,
    releaseScript,
    cleanupWorkflow,
    deploymentGuide,
    migrationSafety,
    localSupabaseStart,
    localSupabaseStop,
  ] = await Promise.all([
    read("package.json"),
    read("vercel.json"),
    read(".github/workflows/ci.yml"),
    read(".github/workflows/release.yml"),
    read("scripts/release-hosted-environment.mjs"),
    read(".github/workflows/delete-merged-feature-branches.yml"),
    read("DEPLOYMENT.md"),
    read("scripts/check-migration-safety.mjs"),
    read("scripts/start-local-supabase.mjs"),
    read("scripts/stop-local-supabase.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const vercel = JSON.parse(vercelSource);

  assert.equal(packageJson.scripts.verify, "npm run lint && npm run build && npm run test:unit");
  assert.equal(packageJson.scripts["test:database"], "node tests/run-database-integration.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node tests/run-browser-smoke.mjs");
  assert.match(packageJson.scripts["admin:bootstrap"], /bootstrap-administrator\.mjs/);
  assert.equal(vercel.buildCommand, "npm run build");
  assert.deepEqual(vercel.git.deploymentEnabled, {
    "**": false,
  });
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /- preview/);
  assert.match(workflow, /Validate promotion path/);
  assert.match(workflow, /feature branch -> preview -> main/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /Validate migration safety/);
  assert.match(migrationSafety, /202608180004_secure_dashboard\.sql/);
  assert.match(migrationSafety, /ffde46ca7af154818d0e2da40349f33d7e05d35f3e7ccc24f3d02855a24cdde3/);
  assert.match(migrationSafety, /072c264e427363a7ece9f812298cadb6df5a286d26e76f5430d6238be2363bf0/);
  assert.match(migrationSafety, /reviewedReplayRepair\.before\.includes\(sha256\(before\)\)/);
  assert.match(migrationSafety, /e85e272056da1c2909227340395075ee3019640c0e2283d3e612475e88fe8018/);
  assert.match(migrationSafety, /sha256\(after\) === reviewedReplayRepair\.after/);
  assert.match(workflow, /run: npm run test:database/);
  assert.match(workflow, /run: npm run test:browser/);
  assert.match(workflow, /SUPABASE_TEST_WORKDIR: \.supabase-test/);
  assert.match(workflow, /node scripts\/start-local-supabase\.mjs/);
  assert.match(workflow, /node scripts\/stop-local-supabase\.mjs/);
  assert.doesNotMatch(localSupabaseStart, /writeFileSync|rolloutGuard|Expected at least two active administrators before rollout/);
  assert.match(localSupabaseStart, /http:\/\/127\.0\.0\.1:55321/);
  assert.match(localSupabaseStop, /--no-backup/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(releaseWorkflow, /SUPABASE_PREVIEW_PROJECT_ID/);
  assert.match(releaseWorkflow, /SUPABASE_PRODUCTION_PROJECT_ID/);
  assert.match(releaseWorkflow, /node scripts\/release-hosted-environment\.mjs/);
  assert.equal((releaseWorkflow.match(/github\.repository == 'webmasterYDSME\/ydsme_v5'/g) || []).length, 2);
  assert.doesNotMatch(releaseWorkflow, /nomenama|mirror-production|git push --force/);
  assert.match(releaseScript, /\["functions", "deploy", "--project-ref", process\.env\.SUPABASE_PROJECT_ID, "--yes"\]/);
  assert.ok(releaseScript.indexOf('["db", "push", "--linked", "--yes", "--skip-vault"]') < releaseScript.indexOf('["functions", "deploy"'));
  assert.ok(releaseScript.indexOf('["functions", "deploy"') < releaseScript.indexOf("fetch(hook"));
  assert.match(cleanupWorkflow, /pull_request\.head\.ref != 'main'/);
  assert.match(cleanupWorkflow, /pull_request\.head\.ref != 'preview'/);
  assert.match(cleanupWorkflow, /pull_request\.merged == true/);
  assert.match(cleanupWorkflow, /github\.rest\.git\.deleteRef/);
  assert.match(deploymentGuide, /feature branch → `preview` → `main`/);
  assert.match(deploymentGuide, /expand-and-contract deployment/);
  assert.match(deploymentGuide, /Never run seeds, fixtures, resets, or data-writing tests against remote Supabase/);
  assert.match(deploymentGuide, /Preview and production must use separate Supabase projects/);
  assert.match(deploymentGuide, /If any critical public route returns a 5xx response/);
});
