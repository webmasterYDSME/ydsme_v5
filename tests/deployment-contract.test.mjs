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
    read("scripts/start-local-supabase.mjs"),
    read("scripts/stop-local-supabase.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const vercel = JSON.parse(vercelSource);

  assert.equal(packageJson.scripts.verify, "npm run lint && npm run build && npm run test:unit");
  assert.equal(packageJson.scripts["test:database"], "node tests/run-database-integration.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node tests/run-browser-smoke.mjs");
  assert.match(packageJson.scripts["admin:bootstrap"], /bootstrap-administrator\.mjs/);
  assert.equal(vercel.buildCommand, "npm run verify");
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
  assert.match(workflow, /run: npm run test:database/);
  assert.match(workflow, /run: npm run test:browser/);
  assert.match(workflow, /SUPABASE_TEST_WORKDIR: \.supabase-test/);
  assert.match(workflow, /node scripts\/start-local-supabase\.mjs/);
  assert.match(workflow, /node scripts\/stop-local-supabase\.mjs/);
  assert.doesNotMatch(localSupabaseStart, /writeFileSync|rolloutGuard|Expected at least three active administrators before rollout/);
  assert.match(localSupabaseStart, /http:\/\/127\.0\.0\.1:55321/);
  assert.match(localSupabaseStop, /--no-backup/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(releaseWorkflow, /SUPABASE_PREVIEW_PROJECT_ID/);
  assert.match(releaseWorkflow, /SUPABASE_PRODUCTION_PROJECT_ID/);
  assert.match(releaseWorkflow, /node scripts\/release-hosted-environment\.mjs/);
  assert.match(releaseWorkflow, /Mirror verified production source/);
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
