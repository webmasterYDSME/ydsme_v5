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
  assert.equal((actions.match(/requireRole\(\["administrator"\]\)/g) ?? []).length, 3);
  assert.match(actions, /consumeRateLimit\("membermojo-import-preview"/);
  assert.match(actions, /consumeRateLimit\("membermojo-import-apply"/);
  assert.match(page, /requireRole\(\["administrator"\]\)/);
  assert.match(wrapper, /apply_membermojo_import/);
  assert.match(features, /MembershipMode = "membermojo" \| "website"/);
  assert.match(features, /"pilot" \|\| configured === "live" \|\| configured === "drain"/);
  await assert.rejects(read("lib/membermojo-csv.ts"), { code: "ENOENT" });
});
