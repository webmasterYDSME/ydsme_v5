import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MEMBERMOJO_REQUIRED_HEADERS,
  MemberMojoCsvError,
  parseMemberMojoCsv,
} from "../lib/membermojo-csv.ts";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(records, extraHeaders = []) {
  const headers = [...MEMBERMOJO_REQUIRED_HEADERS, ...extraHeaders];
  const rows = records.map(record => headers.map(header => csvCell(record[header] ?? "")).join(","));
  return `${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function member(id, overrides = {}) {
  return {
    Title: "Ms",
    "First name": `Member ${id}`,
    "Last name": "Example",
    Email: `member${id}@example.test`,
    Membership: "Adult member",
    "By ticking this box you agree to abide by the Rules of the Club": "Yes",
    "Expires on": "2027-01-31",
    "Renewed on": "2026-02-01",
    "Member since": "2020-01-01",
    "Site role": "Member",
    "Membership state": "Active",
    "membermojo ID": String(id),
    ...overrides,
  };
}

test("parses quoted MemberMojo values and falls back to Windows-1252", () => {
  const source = makeCsv([
    member(101, {
      "First name": "Anne, Marie",
      Membership: "Adult, full member",
      Notes: "Annual £ fee",
    }),
  ], ["Notes"]);
  const parsed = parseMemberMojoCsv(Buffer.from(source, "latin1"), "2026-08-18");

  assert.equal(parsed.encoding, "windows-1252");
  assert.equal(parsed.records[0].firstName, "Anne, Marie");
  assert.equal(parsed.records[0].membershipType, "Adult, full member");
  assert.deepEqual(parsed.ignoredHeaders, ["Notes"]);
});

test("shows six expired records that MemberMojo still explicitly marks Active", () => {
  const records = Array.from({ length: 6 }, (_, index) => member(200 + index, {
    "Expires on": `2025-0${index + 1}-28`,
  }));
  const parsed = parseMemberMojoCsv(Buffer.from(makeCsv(records)), "2026-08-18");
  const expiredActive = parsed.issues.filter(issue => issue.code === "active-past-expiry");

  assert.equal(expiredActive.length, 6);
  assert.deepEqual(expiredActive.map(issue => issue.externalId), ["200", "201", "202", "203", "204", "205"]);
  assert.ok(expiredActive.every(issue => issue.memberName?.startsWith("Member ")));
});

test("flags shared and missing emails without treating MemberMojo roles as permissions", () => {
  const parsed = parseMemberMojoCsv(Buffer.from(makeCsv([
    member(301, { Email: "shared@example.test", "Site role": "Administrator" }),
    member(302, { Email: "SHARED@example.test" }),
    member(303, { Email: "", "Site role": "Committee" }),
  ])), "2026-08-18");

  assert.equal(parsed.issues.filter(issue => issue.code === "shared-email").length, 2);
  assert.equal(parsed.issues.filter(issue => issue.code === "missing-email").length, 1);
  assert.equal(parsed.issues.filter(issue => issue.code === "source-role-ignored").length, 2);
  assert.equal(parsed.records[0].sourceSiteRole, "Administrator");
});

test("rejects duplicate MemberMojo IDs and missing required columns", () => {
  assert.throws(
    () => parseMemberMojoCsv(Buffer.from(makeCsv([member(401), member(401)]))),
    error => error instanceof MemberMojoCsvError && /repeats MemberMojo IDs/.test(error.message),
  );

  const incomplete = "First name,Last name,Email\r\nAda,Lovelace,ada@example.test\r\n";
  assert.throws(
    () => parseMemberMojoCsv(Buffer.from(incomplete)),
    error => error instanceof MemberMojoCsvError && /missing required MemberMojo columns/.test(error.message),
  );
});

test("preview and apply are administrator-gated, same-file, atomic and service-role-only", async () => {
  const [action, comparison, component, page, foundation, applyMigration, lifecycleMigration, reviewMigration] = await Promise.all([
    readFile(new URL("../lib/actions/member-imports.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/membermojo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MemberMojoImportForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/administrator/member-import/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608180026_membermojo_import_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608180027_membermojo_import_apply.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608180028_membermojo_lifecycle_retention.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608180029_membermojo_portal_reviews.sql", import.meta.url), "utf8"),
  ]);

  assert.equal(action.match(/requireCapability\("members\.manage"\)/g)?.length, 3);
  assert.match(action, /z\.literal\("APPLY MEMBERMOJO IMPORT"\)/);
  assert.match(action, /z\.literal\("yes"\)/);
  assert.doesNotMatch(action, /\.(?:insert|update|upsert|delete)\(\{/);
  assert.doesNotMatch(comparison, /\.(?:insert|update|upsert|delete)\(\{/);
  assert.match(comparison, /p_file_sha256: fileSha256/);
  assert.doesNotMatch(comparison.match(/const records = parsed\.records[\s\S]*?as Json;/)?.[0] ?? "", /sourceSiteRole/);
  assert.match(component, /select the exact CSV used for preview/);
  assert.match(component, /Apply membership records/);
  assert.match(component, /Retain ended records for 12 months/);
  assert.match(page, /Portal access reviews/);
  assert.match(page, /ARCHIVE PORTAL ACCESS/);
  assert.match(page, /RETAIN PORTAL ACCESS/);
  assert.match(action, /resolve_membermojo_portal_access_review/);
  assert.match(foundation, /alter table public\.membership_imports enable row level security/);
  assert.match(foundation, /revoke all on table public\.membership_imports from public, anon, authenticated/);
  assert.match(applyMigration, /for update/);
  assert.match(applyMigration, /p_file_sha256 is distinct from v_import\.file_sha256/);
  assert.match(applyMigration, /on conflict \(source, external_id\) do update/);
  assert.match(applyMigration, /insert into public\.audit_logs/);
  assert.match(applyMigration, /portal_accounts_changed', 0/);
  assert.doesNotMatch(applyMigration, /(?:update|insert into|delete from) public\.(?:users|user_roles)/);
  assert.match(applyMigration, /revoke all on function public\.apply_membermojo_membership_import[\s\S]*from public, anon, authenticated/);
  assert.match(applyMigration, /grant execute on function public\.apply_membermojo_membership_import[\s\S]*to service_role/);
  assert.match(lifecycleMigration, /new\.import_mode = 'complete_active_snapshot'/);
  assert.match(lifecycleMigration, /retention_until = v_now \+ interval '12 months'/);
  assert.match(lifecycleMigration, /portal_access_review_required = auth_user_id is not null/);
  assert.match(lifecycleMigration, /auth_user_id is null/);
  assert.match(lifecycleMigration, /and not legal_hold/);
  assert.match(lifecycleMigration, /membership_records_deleted/);
  assert.doesNotMatch(lifecycleMigration, /(?:update|insert into|delete from) public\.(?:users|user_roles)/);
  assert.match(lifecycleMigration, /revoke all on function public\.apply_membermojo_membership_import_v2[\s\S]*from public, anon, authenticated/);
  assert.match(lifecycleMigration, /grant execute on function public\.apply_membermojo_membership_import_v2[\s\S]*to service_role/);
  assert.match(reviewMigration, /p_decision not in \('archive_access', 'retain_access'\)/);
  assert.match(reviewMigration, /membermojo_portal_review_self/);
  assert.match(reviewMigration, /membermojo_portal_review_administrator/);
  assert.match(reviewMigration, /membership_status = 'archived'/);
  assert.match(reviewMigration, /insert into public\.audit_logs/);
  assert.doesNotMatch(reviewMigration, /(?:update|insert into|delete from) auth\.users/);
  assert.match(reviewMigration, /revoke all on function public\.resolve_membermojo_portal_access_review[\s\S]*from public, anon, authenticated/);
  assert.match(reviewMigration, /grant execute on function public\.resolve_membermojo_portal_access_review[\s\S]*to service_role/);
});
