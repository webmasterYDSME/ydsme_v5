import assert from "node:assert/strict";
import test from "node:test";
import { calendarFile, calendarHref } from "../lib/calendar-link.ts";
import { firstNameOf, greetingFor, membershipTile, nextReservedWorkshop } from "../app/dashboard/personal.ts";

const account = (state, extra = {}) => ({
  member: { id: "m", full_name: "A B", contact_email: null, contact_role: "self", effective_state: state, joined_on: "2020-01-01" },
  plan: { name: "Adult", slug: "adult" },
  student_request: { available: false, status: null, membership_year: 2026 },
  term: { membership_year: 2026, status: "paid", ends_on: "2026-12-31", grace_ends_on: "2027-03-01", amount_due_pence: 2000, amount_paid_pence: 2000 },
  subscription: null, honorary: null, history: [], honorary_history: [], ...extra,
});
const tile = (membership, more = {}) => membershipTile({ membership, campaignYear: null, renewalAvailable: false, honoraryTransitionPayment: false, ...more });

test("the greeting follows the London hour and uses only the first name", () => {
  assert.equal(greetingFor(6), "Good morning");
  assert.equal(greetingFor(12), "Good afternoon");
  assert.equal(greetingFor(17), "Good afternoon");
  assert.equal(greetingFor(18), "Good evening");
  assert.equal(firstNameOf("  Clifford   Hudson "), "Clifford");
  assert.equal(firstNameOf(null), "");
});

test("the membership tile says where the member stands and offers the one next step", () => {
  assert.match(tile(null).headline, /Not linked/);
  assert.equal(tile(null).action, null);

  const active = tile(account("active"));
  assert.equal(active.tone, "good");
  assert.match(active.detail, /Paid until 31 December 2026/);
  assert.equal(active.action.label, "View membership");

  const auto = tile(account("active", { subscription: { status: "active", cancel_at_period_end: false, next_charge_at: null, renewal_locked: false, renewal_amount_pence: 2000 } }));
  assert.match(auto.detail, /renew automatically/);

  const renewal = tile(account("active"), { campaignYear: 2027, renewalAvailable: true });
  assert.equal(renewal.tone, "warn");
  assert.equal(renewal.headline, "Renew for 2027");
  assert.equal(renewal.action.label, "Renew online");

  const grace = tile(account("grace"));
  assert.equal(grace.headline, "Renewal due");
  assert.match(grace.detail, /1 March 2027/);

  assert.equal(tile(account("lapsed")).tone, "bad");
  assert.equal(tile(account("payment_review")).action.label, "View membership");
  assert.match(tile(account("honorary")).headline, /Lifetime honorary/);
  assert.match(tile(account("honorary"), { honoraryTransitionPayment: true }).headline, /Renewal is open/);
});

test("the next workshop is the soonest one the member has reserved", () => {
  const workshops = [
    { id: "a", date: "2026-10-05", start_time: "19:00:00" },
    { id: "b", date: "2026-10-02", start_time: "10:00:00" },
    { id: "c", date: "2026-10-02", start_time: "09:00:00" },
  ];
  assert.equal(nextReservedWorkshop(workshops, new Set(["a", "b"])).id, "b");
  assert.equal(nextReservedWorkshop(workshops, new Set()), null);
});

test("add to calendar builds a valid, escaped calendar file inside the link", () => {
  const entry = { uid: "event-7", title: "Running day, steam; all welcome", description: "Line one\nLine two", location: "Hill House", startDate: "2026-09-27", startTime: "10:00:00", endDate: "2026-09-27", endTime: "16:30:00" };
  const file = calendarFile(entry);
  assert.match(file, /^BEGIN:VCALENDAR\r\n/);
  assert.match(file, /DTSTART:20260927T100000\r\n/);
  assert.match(file, /DTEND:20260927T163000\r\n/);
  assert.match(file, /SUMMARY:Running day\\, steam\\; all welcome\r\n/);
  assert.match(file, /DESCRIPTION:Line one\\nLine two\r\n/);
  assert.match(file, /END:VCALENDAR\r\n$/);
  assert.ok(calendarHref(entry).startsWith("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR"));
  // Long lines are folded: no line is longer than 75 characters.
  for (const line of calendarFile({ ...entry, description: "word ".repeat(80) }).split("\r\n")) assert.ok(line.length <= 75, line);
});

test("the dashboard opens with the member's own tiles, and only officers see the membership Inbox summary", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [page, attention, data] = await Promise.all([read("app/dashboard/page.tsx"), read("app/dashboard/attention.ts"), read("lib/dashboard-data.ts")]);
  assert.match(page, /<PersonalStrip tiles=\{stripTiles\}\/>/);
  // The bell lives in the portal shell, so the strip has no notifications tile; it shows the next running day instead.
  assert.doesNotMatch(page, /key: "notifications"/);
  assert.match(page, /key: "running-day", label: "Next running day"/);
  assert.match(page, /greetingFor\(londonHour\(\)\)/);
  // Officers only, and only when membership administration is on.
  assert.match(page, /membershipOfficer && \(await membershipAdministrationEnabled\(\)\) \? loadAttention\(\)/);
  assert.match(page, /attention \? <AttentionStrip/);
  // A fault reading the member's own record or the Inbox never stops the page.
  assert.match(page, /getMembershipAccount\(user\.id\)\.catch/);
  assert.match(attention, /catch \(error\)/);
  // Events and workshops open to details with an add-to-calendar link.
  assert.match(page, /calendarHref\(/);
  assert.match(page, /You’re booked/);
  // events.host is a user id, so it must never be shown.
  assert.doesNotMatch(data, /event_type,descriptions,host/);
  assert.doesNotMatch(page, /event\.host/);
});

test("Add a notice guides the member, shows counts that match the server limits, and reports the result beside the button", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [composer, actions, page] = await Promise.all([read("app/dashboard/_components/NoticeComposer.tsx"), read("lib/actions/content.ts"), read("app/dashboard/page.tsx")]);
  assert.match(composer, /Before you post/);
  assert.match(composer, /Links are not clickable/);
  assert.match(composer, /archive your own notices at any time/);
  assert.match(composer, /TITLE_MAX = 120/);
  assert.match(composer, /MESSAGE_MAX = 2000/);
  const createMessage = actions.slice(actions.indexOf("export async function createMessage"), actions.indexOf("export async function deleteMessage"));
  assert.match(createMessage, /text\(2, 120\)/);
  assert.match(createMessage, /text\(2, 2000\)/);
  assert.match(createMessage, /consumeRateLimit\("member-notice", 5, 60 \* 60/);
  // Results come back to the form; nothing sends the member to the top of the page.
  assert.doesNotMatch(createMessage, /redirect\(/);
  assert.match(page, /<NoticeComposer first=\{!notices\.length\}\/>/);
  // The club shop keeps its dark banner style.
  assert.match(page, /dashboard-merch-card/);
});

test("the notice board holds member posts only, with the composer opening in a dialog", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  // Member posts are read directly, so documents and automatic "new member" entries never appear on the board.
  assert.match(page, /\.eq\("type", "message"\)\.eq\("lifecycle_status", "published"\)/);
  // The composer lives inside the Latest from the club card, and there is no separate composer or "Earlier updates" card.
  const board = page.slice(page.indexOf('aria-labelledby="latest-club-update"'), page.indexOf('className="dashboard-workbench"'));
  assert.match(board, /<NoticeComposer first=\{!notices\.length\}\/>/);
  assert.doesNotMatch(page, /earlier-updates|ResponsiveDashboardCard|dashboard-community-grid/);
  // The newest upload moves to the library card.
  assert.match(page, /Latest upload/);
  // Long notices are shortened to a preview so one post cannot stretch the page, and neither column is stretched to match the other.
  assert.match(page, /NOTICE_PREVIEW_CHARS/);
  assert.match(page, /Read the full notice/);
  const css = await readFile(new URL("../app/dashboard/dashboard.module.css", import.meta.url), "utf8");
  assert.match(css, /\.columns \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); align-items: start;/);
  // Balanced columns: running days and workshops on the left, the notice board and library on the right.
  const columns = page.slice(page.indexOf("styles.columns"), page.indexOf('className="dashboard-workbench"'));
  const at = (text) => columns.indexOf(text);
  assert.ok(at("upcoming-running-days") < at("workshop-bench") && at("workshop-bench") < at("latest-club-update") && at("latest-club-update") < at("society-library"));
  // "Write a notice" opens a native modal dialog that keeps the draft and closes on Escape or a click outside.
  const composer = await readFile(new URL("../app/dashboard/_components/NoticeComposer.tsx", import.meta.url), "utf8");
  assert.match(composer, /<dialog/);
  assert.match(composer, /showModal\(\)/);
  assert.match(composer, /Write the first notice/);
});

