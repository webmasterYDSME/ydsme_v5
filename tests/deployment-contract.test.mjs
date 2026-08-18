import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("runs the same deployment verification locally, in GitHub, and on Vercel", async () => {
  const [packageSource, vercelSource, workflow, deploymentGuide] = await Promise.all([
    read("package.json"),
    read("vercel.json"),
    read(".github/workflows/ci.yml"),
    read("DEPLOYMENT.md"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const vercel = JSON.parse(vercelSource);

  assert.equal(packageJson.scripts.verify, "npm run lint && npm test");
  assert.equal(vercel.buildCommand, "npm run verify");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run verify/);
  assert.match(deploymentGuide, /expand-and-contract deployment/);
  assert.match(deploymentGuide, /Never run seeds, fixtures, resets, or data-writing tests against remote Supabase/);
  assert.match(deploymentGuide, /If any critical public route returns a 5xx response/);
});
