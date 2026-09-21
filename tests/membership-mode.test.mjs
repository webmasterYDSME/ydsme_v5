import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  IMPORT_FRESH_DAYS, blockers, daysSince, evaluateReadiness, warnings, websiteConfirmationMatches,
} from "../lib/membership-mode-format.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) found.push(...sourceFiles(`${path}/`));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test("who runs membership is read from the database, never from an environment variable", () => {
  const features = read("lib/features.ts");
  assert.doesNotMatch(features, /process\.env/);
  assert.match(features, /rpc\("membership_mode"\)/);
  // Unreadable means MemberMojo, so nothing is charged or emailed.
  assert.match(features, /return "membermojo";\s*\}\);/);
  for (const path of [...sourceFiles("app/"), ...sourceFiles("lib/")]) {
    assert.doesNotMatch(read(path), /MEMBERSHIP_MODE/, `${path} still reads MEMBERSHIP_MODE`);
  }
  for (const path of ["supabase/functions/deliver-membership-notifications/index.ts", "supabase/functions/run-membership-automation/index.ts", "supabase/config.toml", ".env.example"]) {
    assert.doesNotMatch(read(path), /MEMBERSHIP_MODE/, `${path} still mentions MEMBERSHIP_MODE`);
  }
});

test("every membership mode check is awaited: a forgotten await is a Promise, which is always true", () => {
  const call = /\b(membership(?:Platform|Automation|Billing|Administration|Recovery)Enabled|membershipMode)\(\)/g;
  let checked = 0;
  for (const path of [...sourceFiles("app/"), ...sourceFiles("lib/")]) {
    if (path === "lib/features.ts") continue;
    const text = read(path);
    for (const match of text.matchAll(call)) {
      const before = text.slice(Math.max(0, match.index - 8), match.index);
      assert.match(before, /await\s$/, `${path}: ${match[0]} is not awaited`);
      checked += 1;
    }
  }
  assert.ok(checked > 40, "expected to find the checks in the app");
});

test("both edge functions read the setting from the database and treat an unreadable one as MemberMojo", () => {
  const deliver = read("supabase/functions/deliver-membership-notifications/index.ts");
  assert.match(deliver, /rpc\("membership_mode"\)/);
  assert.match(deliver, /modeError \|\| membershipMode !== "website"/);
  const automation = read("supabase/functions/run-membership-automation/index.ts");
  assert.match(automation, /rpc\("membership_mode"\)/);
  assert.match(automation, /Boolean\(modeError\) \|\| configured !== "website"/);
});

test("the switch page and its actions are for administrators only, and switching back is one confirmation", () => {
  const page = read("app/administrator/membership-mode/page.tsx");
  const actions = read("app/administrator/membership-mode/actions.ts");
  assert.match(page, /requireRole\(\["administrator"\]\)/);
  assert.equal((actions.match(/requireRole\(\["administrator"\]\)/g) ?? []).length, 1, "one shared administrator() guard");
  assert.equal((actions.match(/await administrator\(\)/g) ?? []).length, 2, "both actions ask again");
  const toWebsite = actions.slice(actions.indexOf("export async function switchToWebsite"), actions.indexOf("export async function switchToMemberMojo"));
  const toMemberMojo = actions.slice(actions.indexOf("export async function switchToMemberMojo"));
  // Handing over needs a reason, the typed word and the checks run again on the server.
  assert.match(toWebsite, /websiteConfirmationMatches\(typed\)/);
  assert.match(toWebsite, /await loadReadiness\(\)/);
  assert.match(toWebsite, /blockers\(checks\)\.length > 0/);
  assert.match(toWebsite, /accept_warnings/);
  // Going back is the emergency brake: no typing, no checks, and the reason is optional.
  assert.doesNotMatch(toMemberMojo, /websiteConfirmationMatches|loadReadiness|confirmation/);
  assert.match(toMemberMojo, /DEFAULT_SWITCH_BACK_REASON/);
  assert.match(page, /confirmMessage=/);
  const layout = read("app/administrator/layout.tsx");
  assert.match(layout, /roles=\{\["administrator"\]\}/);
  assert.match(read("lib/portal-nav.ts"), /href: "\/administrator\/membership-mode", label: "Membership system"/);
});

test("only the database function changes the mode, and it is closed to everyone but the server", () => {
  const sql = read("supabase/migrations/202609210005_membership_mode_setting.sql");
  assert.match(sql, /revoke all on public\.membership_mode_settings from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.set_membership_mode\(uuid, text, text, jsonb, boolean\) from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.membership_mode_settings to service_role/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*membership_mode_settings/);
  assert.match(sql, /security definer/);
  assert.match(sql, /ur\.role = 'administrator'/);
  assert.match(sql, /insert into public\.audit_logs/);
  assert.match(sql, /'membermojo'\)\s*on conflict/, "a new database starts on MemberMojo");
});

const ready = {
  now: new Date("2026-09-21T12:00:00Z"), year: 2026,
  paymentsConfigured: true, paymentsInTestMode: false, emailConfigured: true, missingFees: [],
  lastImportAt: "2026-09-20T09:00:00Z", activeMembers: 200, activeWithLogin: 180,
  emailQueue: { failed: 0, providerPaused: false, bulkPaused: false },
};
const level = (checks, key) => checks.find((check) => check.key === key)?.level;

test("readiness: a healthy setup has nothing to fix or check", () => {
  const checks = evaluateReadiness(ready);
  assert.equal(blockers(checks).length, 0);
  assert.equal(warnings(checks).length, 0);
});

test("readiness: missing payments, email or fees block the switch; the rest can be accepted", () => {
  assert.equal(level(evaluateReadiness({ ...ready, paymentsConfigured: false }), "payments"), "blocked");
  assert.equal(level(evaluateReadiness({ ...ready, emailConfigured: false }), "email"), "blocked");
  const fees = evaluateReadiness({ ...ready, missingFees: ["Adult", "Junior"] });
  assert.equal(level(fees, "fees"), "blocked");
  assert.match(fees.find((check) => check.key === "fees").detail, /Adult, Junior/);
  assert.equal(level(evaluateReadiness({ ...ready, paymentsInTestMode: true }), "payments"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, lastImportAt: null }), "import"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, lastImportAt: "2026-09-01T09:00:00Z" }), "import"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, activeMembers: 100, activeWithLogin: 20 }), "logins"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, emailQueue: { failed: 3, providerPaused: false, bulkPaused: false } }), "queue"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, emailQueue: { failed: 0, providerPaused: true, bulkPaused: true } }), "queue"), "warning");
  assert.equal(level(evaluateReadiness({ ...ready, emailQueue: null }), "queue"), "warning");
});

test("readiness: how old the last import is", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince("not a date", now), null);
  assert.equal(daysSince("2026-09-21T11:00:00Z", now), 0);
  assert.equal(daysSince("2026-09-14T11:00:00Z", now), 7);
  assert.equal(daysSince("2026-12-01T00:00:00Z", now), 0, "a date in the future is never negative");
  assert.equal(level(evaluateReadiness({ ...ready, lastImportAt: "2026-09-14T11:00:00Z" }), "import"), "ok", `exactly ${IMPORT_FRESH_DAYS} days is still fresh`);
  assert.equal(level(evaluateReadiness({ ...ready, lastImportAt: "2026-09-13T11:00:00Z" }), "import"), "warning");
});

test("the word that confirms the switch is website, in any case, with spaces ignored", () => {
  for (const typed of ["website", " Website ", "WEBSITE"]) assert.ok(websiteConfirmationMatches(typed), typed);
  for (const typed of ["", "web", "the website", "membermojo", "yes"]) assert.ok(!websiteConfirmationMatches(typed), typed);
});
