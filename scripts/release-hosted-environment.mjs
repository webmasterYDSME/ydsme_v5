import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const required = [
  "RELEASE_BRANCH",
  "RELEASE_OTHER_PROJECT_ID",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_ID",
  "VERCEL_DEPLOY_HOOK",
];
for (const name of required) assert.ok(process.env[name], `${name} is not configured.`);

assert.notEqual(
  process.env.SUPABASE_PROJECT_ID,
  process.env.RELEASE_OTHER_PROJECT_ID,
  "Preview and production must use different Supabase projects.",
);

const hook = new URL(process.env.VERCEL_DEPLOY_HOOK);
assert.equal(hook.protocol, "https:", "The Vercel deploy hook must use HTTPS.");
assert.equal(hook.hostname, "api.vercel.com", "The deploy hook must be an official Vercel API URL.");

const releaseSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const remoteRef = `refs/heads/${process.env.RELEASE_BRANCH}`;

function currentRemoteSha() {
  return execFileSync("git", ["ls-remote", "origin", remoteRef], { encoding: "utf8" })
    .trim()
    .split(/\s+/)[0];
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

if (currentRemoteSha() !== releaseSha) {
  console.log(`Skipping stale ${process.env.RELEASE_BRANCH} release ${releaseSha}.`);
  output("stale", "true");
  process.exit(0);
}

function run(args) {
  const result = spawnSync("npx", ["supabase", ...args], { env: process.env, stdio: "inherit" });
  assert.equal(result.status, 0, `supabase ${args.join(" ")} failed.`);
}

run(["link", "--project-ref", process.env.SUPABASE_PROJECT_ID]);
run(["db", "push", "--linked", "--dry-run", "--skip-vault"]);
run(["db", "push", "--linked", "--yes", "--skip-vault"]);

if (currentRemoteSha() !== releaseSha) {
  console.log("Migrations completed, but a newer branch commit now exists; the newer release will deploy it.");
  output("stale", "true");
  process.exit(0);
}

const response = await fetch(hook, { method: "POST", redirect: "error" });
assert.ok(response.ok, `Vercel rejected the deploy hook with HTTP ${response.status}.`);

output("stale", "false");
output("released_sha", releaseSha);
console.log(`Applied pending migrations and triggered the ${process.env.RELEASE_BRANCH} deployment.`);
