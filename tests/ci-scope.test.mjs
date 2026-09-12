import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedScope, classifyChanges } from "../scripts/ci-scope.mjs";

test("presentation changes skip Supabase but backend and unknown paths do not", () => {
  assert.deepEqual(classifyChanges(["app/under-review/page.tsx", "app/globals.css", "public/logo.svg"]), { integration: false, migrations: false });
  for (const path of ["lib/actions/membership.ts", "app/api/stripe/webhook/route.ts", "app/events/page.tsx", "proxy.ts", "new-config.json", "supabase/functions/example/index.ts"]) {
    assert.equal(classifyChanges(["app/globals.css", path]).integration, true, path);
  }
  for (const path of ["supabase/migrations/new.sql", ".github/workflows/ci.yml", "scripts/ci-scope.mjs", "tests/ci-scope.test.mjs", "package-lock.json"]) {
    assert.deepEqual(classifyChanges([path]), { integration: true, migrations: true }, path);
  }
});

test("diff failures and new branches require the full checks", () => {
  for (const base of [undefined, "not-a-sha", "0".repeat(40), "f".repeat(40)]) {
    assert.deepEqual(changedScope(base, "a".repeat(40), "push"), { integration: true, migrations: true, paths: null });
  }
});

test("push ranges include earlier commits and renames include the removed backend path", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "ydsme-ci-scope-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = () => { git("add", "."); git("commit", "-qm", "fixture"); return git("rev-parse", "HEAD"); };
  git("init", "-q");
  git("config", "user.name", "CI fixture");
  git("config", "user.email", "ci@example.test");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(cwd, "lib"));
  writeFileSync(join(cwd, "lib/backend.ts"), "original");
  const base = commit();
  writeFileSync(join(cwd, "lib/backend.ts"), "changed");
  commit();
  writeFileSync(join(cwd, "style.css"), "body { color: green; }");
  const head = commit();
  assert.equal(changedScope(base, head, "push", cwd).integration, true);
  git("mv", "lib/backend.ts", "README.md");
  const renamed = commit();
  assert.equal(changedScope(head, renamed, "push", cwd).integration, true);
  assert.ok(changedScope(head, renamed, "push", cwd).paths.includes("lib/backend.ts"));
  // The PR must include its full branch history even when the final commit is CSS.
  assert.equal(changedScope(base, head, "pull_request", cwd).integration, true);
});
