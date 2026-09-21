import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MEMBER_LIST_MAX_ROWS, MemberListError, parseMemberList, readBirthDate, readPhone, readPostcode } from "../lib/membermojo-list.ts";

const bytes = (text, encoding = "utf8") => new Uint8Array(Buffer.from(text, encoding));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reads a MemberMojo export: first name, last name, email and membership", () => {
  const parsed = parseMemberList(bytes(
    "Title,First name,Last name,Email,Membership,Membership state,Expires on\r\n"
    + "Ms,Ann,Example,Ann@Example.test,Adult member,Active,2025-01-31\r\n"
    + "Mr,Bob,Sample,bob@example.test,Junior member,Active,2027-01-31\r\n",
  ));
  assert.deepEqual(parsed.rows.map(({ fullName, email, membershipType }) => ({ fullName, email, membershipType })), [
    { fullName: "Ann Example", email: "ann@example.test", membershipType: "Adult member" },
    { fullName: "Bob Sample", email: "bob@example.test", membershipType: "Junior member" },
  ]);
  assert.equal(parsed.rows[0].dateOfBirth, "");
  assert.equal(parsed.notActive, 0);
  assert.deepEqual(parsed.columnsUsed, ["First name and Last name", "Email", "Membership", "Membership state", "Title"]);
});

test("reads the simple email and full_name layout and ignores every other column", () => {
  const parsed = parseMemberList(bytes("full_name,email,secret\n\"Smith, Jo\",jo@example.test,x\n"));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].fullName, "Smith, Jo");
  assert.equal(parsed.rows[0].email, "jo@example.test");
  assert.deepEqual(parsed.columnsUsed, ["full_name", "Email"]);
});

test("reads title, month and year of birth, phone and address from MemberMojo's layout", () => {
  const parsed = parseMemberList(bytes(
    "Title,First name,Last name,Month and Year of Birth,Email,Contact number,Address line 1,Address line 2,Address line 3,Address line 4,Postcode,Membership,Unsubscribe group email\n"
    + "Dr,Ann,Example,1958-04-01,a@example.test,t:01904 123456,1 High Street,Heslington,Fulford,York,yo10  5dd,Adult,no\n"
    + "Mr,Bob,Sample,,b@example.test,t:+447700900123,2 Low Road,,,York,,Adult,YES\n"
    + "Ms,Cat,Nowhere,15/13/1990,c@example.test,,,,,,,Adult,\n",
  ));
  assert.deepEqual(parsed.rows[0], {
    fullName: "Ann Example", email: "a@example.test", membershipType: "Adult", title: "Dr", dateOfBirth: "1958-04-01",
    phone: "01904 123456", addressLineOne: "1 High Street", addressLineTwo: "Heslington, Fulford", city: "York", postcode: "YO10 5DD",
    groupEmailUnsubscribed: "no",
  });
  assert.deepEqual(parsed.rows.map((row) => row.groupEmailUnsubscribed), ["no", "yes", ""]);
  assert.equal(parsed.rows[1].dateOfBirth, "");
  assert.equal(parsed.rows[1].phone, "+447700900123");
  assert.equal(parsed.rows[1].addressLineTwo, "");
  assert.equal(parsed.rows[1].city, "York");
  assert.equal(parsed.rows[2].dateOfBirth, "");
  assert.equal(parsed.unreadableBirthDates, 1);
  assert.equal(parsed.birthMonthOnly, true);
  assert.ok(parsed.columnsUsed.includes("Address") && parsed.columnsUsed.includes("Contact number"));
});

test("dates, numbers and postcodes are tidied and never invented", () => {
  assert.equal(readBirthDate("2008-04-01"), "2008-04-01");
  assert.equal(readBirthDate("01/04/2008"), "2008-04-01");
  assert.equal(readBirthDate("04/2008"), "2008-04-01");
  assert.equal(readBirthDate("2008-02-31"), "");
  assert.equal(readBirthDate("1850-01-01"), "");
  assert.equal(readBirthDate("2999-01-01"), "");
  assert.equal(readBirthDate("soon"), "");
  assert.equal(readPhone("t:01904  123456"), "01904 123456");
  assert.equal(readPhone("m: 07700 900123"), "07700 900123");
  assert.equal(readPostcode("YO61 3 SA"), "YO61 3SA");
  assert.equal(readPostcode("hg4  1rl"), "HG4 1RL");
});

test("leaves out people who are not Active", () => {
  const parsed = parseMemberList(bytes("Email,Full name,Membership state\na@example.test,A One,Active\nb@example.test,B Two,Expired\n"));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.notActive, 1);
  assert.throws(() => parseMemberList(bytes("Email,Full name,Membership state\nb@example.test,B Two,Expired\n")), MemberListError);
});

test("falls back to Windows-1252 and keeps blank emails", () => {
  const parsed = parseMemberList(bytes("Email,Full name\n,Zoë Fern\n", "latin1"));
  assert.equal(parsed.rows[0].fullName, "Zoë Fern");
  assert.equal(parsed.rows[0].email, "");
});

test("refuses files that cannot be read safely", () => {
  assert.throws(() => parseMemberList(bytes("")), MemberListError);
  assert.throws(() => parseMemberList(bytes("Email\na@example.test\n")), /full_name|First name/);
  assert.throws(() => parseMemberList(bytes("Full name\nA One\n")), /Email column/);
  assert.throws(() => parseMemberList(bytes("Email,Full name\na@example.test,\"Unfinished\n")), MemberListError);
  assert.throws(() => parseMemberList(bytes("Email,Full name\na@example.test,ab\"c\n")), MemberListError);
  assert.throws(() => parseMemberList(bytes(`Email,Full name\na@example.test,${"x".repeat(181)}\n`)), /too long/);
  const many = `Email,Full name\n${Array.from({ length: MEMBER_LIST_MAX_ROWS + 1 }, (_, index) => `p${index}@example.test,Person ${index}`).join("\n")}\n`;
  assert.throws(() => parseMemberList(bytes(many)), /more than 1000/);
});

test("the import is administrator-only, rate limited, and the old modes are gone", async () => {
  const [actions, features, wrapper, page] = await Promise.all([
    read("lib/actions/member-imports.ts"),
    read("lib/features.ts"),
    read("lib/membermojo.ts"),
    read("app/administrator/member-import/page.tsx"),
  ]);
  assert.equal((actions.match(/requireRole\(\["administrator"\]\)/g) ?? []).length, 4);
  assert.match(actions, /consumeRateLimit\("membermojo-import-preview"/);
  assert.match(actions, /consumeRateLimit\("membermojo-import-apply"/);
  assert.match(page, /requireRole\(\["administrator"\]\)/);
  assert.match(wrapper, /apply_membermojo_import/);
  assert.match(features, /MembershipMode = "membermojo" \| "website"/);
  assert.match(features, /"pilot" \|\| configured === "live" \|\| configured === "drain"/);
  await assert.rejects(read("lib/membermojo-csv.ts"), { code: "ENOENT" });
});

test("import invitations use the membership wording and open the account, with no password step", async () => {
  const [job, template] = await Promise.all([read("supabase/functions/run-membership-automation/index.ts"), read("supabase/templates/invite.html")]);
  assert.match(job, /invite_context: "membermojo"/);
  assert.match(job, /auth\/invite\?next=\/account/);
  assert.doesNotMatch(job, /reset-password/);
  assert.match(template, /eq \$context "membermojo"/);
  assert.match(template, /Your account is ready/);
});

test("invitations are sent by a background job that an administrator starts once", async () => {
  const [job, actions, migration, panel] = await Promise.all([
    read("supabase/functions/run-membership-automation/index.ts"), read("lib/actions/member-imports.ts"),
    read("supabase/migrations/202609190023_member_invitation_run.sql"), read("app/components/MemberMojoImportForm.tsx"),
  ]);
  // The job works in every mode, so it is handled before the MemberMojo-mode pause.
  assert.ok(job.indexOf('body.job === "invitations"') < job.indexOf("membermojoMode && body.job"));
  assert.match(job, /claim_member_invitation_run/);
  assert.match(job, /finish_member_invitation_run/);
  assert.match(job, /status === 429/);
  assert.match(job, /INVITATIONS_PER_RUN = 10/);
  // Administrators start and pause it; there is no button that sends a batch by hand any more.
  assert.match(actions, /start_member_invitations/);
  assert.match(actions, /pause_member_invitations/);
  assert.doesNotMatch(actions, /inviteUserByEmail|sendMemberInvitations/);
  assert.doesNotMatch(panel, /Send the next/);
  // Every function and table is for the server only, and the job runs every five minutes.
  assert.doesNotMatch(migration, /grant execute on function [^;]* to (anon|authenticated)/i);
  assert.match(migration, /revoke all on public\.member_invitation_run from public, anon, authenticated/);
  assert.match(migration, /'\*\/5 \* \* \* \*'/);
  assert.match(migration, /interval '15 minutes'/);
});

test("the import archives people who are missing from the list, asks for a typed number when the clear-out is large, and protects officers", async () => {
  const [membermojo, actions, form, migration] = await Promise.all([
    read("lib/membermojo.ts"), read("lib/actions/member-imports.ts"), read("app/components/MemberMojoImportForm.tsx"),
    read("supabase/migrations/202609210004_membermojo_import_archives_absent_members.sql"),
  ]);
  // A large archive needs the number typed back, checked on the server as well as shown in the form.
  assert.match(membermojo, /ARCHIVE_CONFIRMATION_FROM = 10/);
  assert.match(membermojo, /archiveNeedsTypedConfirmation\(archiveCount, register\) && typedArchiveCount\.trim\(\) !== String\(archiveCount\)/);
  assert.match(actions, /archiveCount/);
  assert.match(form, /name="archiveCount"/);
  assert.match(form, /Will be archived/);
  // Archive, never delete; administrators, committee logins, legal holds and suspended members are kept.
  assert.doesNotMatch(migration, /delete from public\.members|anonymise_membership_member/);
  assert.match(migration, /ur\.role <> 'member'/);
  assert.match(migration, /public\.committees c where c\.user_id/);
  assert.match(migration, /'keep_hold'/);
  assert.match(migration, /'keep_state'/);
  assert.match(migration, /archive_reason = 'membermojo_import'/);
});
