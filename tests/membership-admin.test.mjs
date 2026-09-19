import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { legacyMembershipRedirect } from "../lib/membership-admin/legacy-urls.ts";
import { membershipErrorMessage } from "../lib/membership-admin/messages.ts";
import { emptyOfficerMemberState, submittedValues } from "../lib/membership-admin/officer-member.ts";
import { ageOn, capitaliseName, dateLabel, dateTimeLabel, memberStateName, money, paymentMethodName, timestampDateLabel, waitingLabel } from "../lib/membership-admin/format.ts";
import { ageTransitionSlug, buildRenewalChoices, renewableMembers } from "../lib/membership-rules.ts";

const memberId = "0f6f2a3c-1b7d-4e55-8c1a-5d2f7b9e4a10";

test("leaves current membership addresses alone", () => {
  assert.equal(legacyMembershipRedirect({}), null);
  assert.equal(legacyMembershipRedirect({ notice: "offline-payment-confirmed" }), null);
  assert.equal(legacyMembershipRedirect({ task: "verification.abc", kind: "verify" }), null);
});

test("translates old section links into the new workspace and keeps the message", () => {
  const cases = [
    [{ section: "applications" }, "/admin/memberships?kind=payment"],
    [{ section: "pending-payments" }, "/admin/memberships?kind=payment"],
    [{ section: "student-requests", notice: "student-request-reviewed" }, "/admin/memberships?notice=student-request-reviewed&kind=request"],
    [{ section: "manual-contact" }, "/admin/memberships?kind=contact"],
    [{ section: "payment-reviews" }, "/admin/memberships?kind=problem"],
    [{ section: "honorary-conflicts" }, "/admin/memberships?kind=problem"],
    [{ section: "email-failures" }, "/admin/memberships?kind=problem"],
    [{ section: "online-payment-problems" }, "/admin/memberships?kind=problem"],
    [{ queue: "payment-review" }, "/admin/memberships?kind=problem"],
    [{ queue: "delivery-failures" }, "/admin/memberships?kind=problem"],
    [{ section: "renewals" }, "/admin/memberships/renewals"],
    [{ section: "plans", notice: "price-saved" }, "/admin/memberships/renewals?notice=price-saved"],
    [{ section: "payment-settings", notice: "membership-payment-settings-saved" }, "/admin/memberships/setup?notice=membership-payment-settings-saved&tab=payment"],
    [{ section: "reports" }, "/admin/memberships/setup?tab=reports"],
    [{ section: "membermojo-import", notice: "migration-review-saved" }, "/admin/memberships/setup?notice=migration-review-saved&tab=import"],
    [{ section: "add-member" }, "/admin/memberships/members?add=member"],
    [{ section: "honorary" }, "/admin/memberships/members?status=honorary"],
    [{ section: "member-history" }, "/admin/memberships/members"],
  ];
  for (const [query, expected] of cases) assert.equal(legacyMembershipRedirect(query), expected, JSON.stringify(query));
});

test("translates old view tabs", () => {
  assert.equal(legacyMembershipRedirect({ view: "members" }), "/admin/memberships/members");
  assert.equal(legacyMembershipRedirect({ view: "payments", notice: "renewals-opened" }), "/admin/memberships/renewals?notice=renewals-opened");
  assert.equal(legacyMembershipRedirect({ view: "plans" }), "/admin/memberships/renewals");
  assert.equal(legacyMembershipRedirect({ view: "reports" }), "/admin/memberships/setup?tab=reports");
  assert.equal(legacyMembershipRedirect({ view: "attention" }), "/admin/memberships");
  assert.equal(legacyMembershipRedirect({ queue: "unknown" }), "/admin/memberships");
});

test("opens the member record for a valid member and ignores a malformed id", () => {
  assert.equal(legacyMembershipRedirect({ member: memberId, section: "member-history", notice: "portal-login-assigned" }),
    `/admin/memberships/members/${memberId}?notice=portal-login-assigned`);
  assert.equal(legacyMembershipRedirect({ member: memberId }), `/admin/memberships/members/${memberId}`);
  assert.equal(legacyMembershipRedirect({ member: "../../etc", section: "renewals" }), "/admin/memberships/renewals");
  assert.equal(legacyMembershipRedirect({ member: memberId, error: "eligibility-correction-failed" }),
    `/admin/memberships/members/${memberId}?error=eligibility-correction-failed`);
});

test("a translated address is never translated again", () => {
  const queries = [{ section: "plans" }, { view: "payments" }, { member: memberId }, { queue: "payment-review" }, { section: "add-member" }];
  for (const query of queries) {
    const target = legacyMembershipRedirect(query);
    const params = Object.fromEntries(new URL(target, "https://example.test").searchParams);
    assert.equal(legacyMembershipRedirect(params), null, target);
  }
});

test("formats money, payment methods, member states, dates and waiting times", () => {
  assert.equal(money(4500), "£45.00");
  assert.equal(paymentMethodName("bank_transfer"), "bank transfer");
  assert.equal(paymentMethodName(null), "payment");
  assert.equal(memberStateName("grace"), "Payment overdue");
  assert.equal(memberStateName("some_new_state"), "some new state");
  assert.equal(dateLabel("2026-09-18"), "18 Sept 2026");
  assert.equal(dateLabel("2011-09-02"), "2 Sept 2011");
  assert.equal(dateLabel("2026-01-05T10:00:00Z"), "5 Jan 2026");
  assert.equal(timestampDateLabel("2026-08-31T23:30:00Z"), "1 Sept 2026");
  assert.equal(dateTimeLabel("2026-01-05T14:30:00Z"), "5 Jan 2026, 14:30");
  assert.equal(dateTimeLabel("2026-07-05T14:30:00Z"), "5 Jul 2026, 15:30");
  assert.equal(dateTimeLabel(null), "");
  assert.equal(dateLabel(null), "");
  const now = new Date("2026-09-18T15:00:00Z");
  assert.equal(waitingLabel("2026-09-18T01:00:00Z", now), "Today");
  assert.equal(waitingLabel("2026-09-17T23:59:00Z", now), "Yesterday");
  assert.equal(waitingLabel("2026-09-12T10:00:00Z", now), "6 days");
  assert.equal(waitingLabel(null, now), "");
});

const adult = "plan-adult";
const student = "plan-student";
const prices = [
  { plan_id: adult, membership_year: 2027, amount_pence: 4500 },
  { plan_id: adult, membership_year: 2026, amount_pence: 4200 },
  { plan_id: student, membership_year: 2026, amount_pence: 2000 },
];
const member = (overrides) => ({ id: "m1", current_plan_id: adult, effective_state: "active", honorary_memberships: [], ...overrides });
const choices = (memberOverrides, extra = {}) => buildRenewalChoices({
  members: [member(memberOverrides)], prices, transitions: [], terms: [], currentYear: 2026, formatMoney: money, ...extra,
});
const forYear = (list, year) => list.find((choice) => choice.membership_year === year);

test("only members who can be renewed are offered", () => {
  const list = renewableMembers([
    member({ id: "a" }), member({ id: "b", effective_state: "suspended" }), member({ id: "c", effective_state: "archived" }),
    member({ id: "d", current_plan_id: null }), member({ id: "e", effective_state: "honorary", honorary_memberships: [] }),
    member({ id: "f", effective_state: "honorary", honorary_memberships: [{ status: "active", effective_from: "2020-01-01", revoked_effective_on: "2027-01-01", replacement_plan_id: adult }] }),
  ]);
  assert.deepEqual(list.map((item) => item.id), ["a", "f"]);
});

test("renewal amounts follow the recorded fee and carry an earlier fee forward", () => {
  const list = choices({});
  assert.equal(forYear(list, 2026).amount_pence, 4200);
  assert.equal(forYear(list, 2027).amount_pence, 4500);
  assert.equal(forYear(list, 2027).note, "Full annual fee for 2027.");
  const carried = choices({ current_plan_id: student });
  assert.equal(forYear(carried, 2027).amount_pence, 2000);
});

test("renewal amounts are withheld with a reason when no payment should be recorded", () => {
  const paid = choices({}, { terms: [{ member_id: "m1", membership_year: 2026, status: "paid", amount_due_pence: 4200, amount_paid_pence: 4200, source: "stripe" }] });
  assert.equal(forYear(paid, 2026).amount_pence, null);
  assert.match(forYear(paid, 2026).note, /already paid/);
  const review = choices({}, { terms: [{ member_id: "m1", membership_year: 2027, status: "payment_review", amount_due_pence: 4500, amount_paid_pence: 4500, source: "stripe" }] });
  assert.match(forYear(review, 2027).note, /payment review/);
  const pendingStudent = choices({}, { transitions: [{ member_id: "m1", membership_year: 2027, status: "awaiting_student_review", to_plan_id: student }] });
  assert.equal(forYear(pendingStudent, 2027).amount_pence, null);
  assert.match(forYear(pendingStudent, 2027).note, /Student membership request/);
  const noFee = choices({ current_plan_id: "plan-unpriced" });
  assert.equal(forYear(noFee, 2026).note, "No annual fee is available for 2026.");
  const honorary = choices({ honorary_memberships: [{ status: "active", effective_from: "2025-01-01", revoked_effective_on: null, replacement_plan_id: null }] });
  assert.match(forYear(honorary, 2026).note, /Honorary membership covers this year/);
});

test("a pending officer or application term is charged exactly as already due", () => {
  const list = choices({}, { terms: [{ member_id: "m1", membership_year: 2027, status: "scheduled", amount_due_pence: 1500, amount_paid_pence: 0, source: "officer" }] });
  assert.equal(forYear(list, 2027).amount_pence, 1500);
  assert.match(forYear(list, 2027).note, /already due/);
});

test("ending honorary membership part-way through a year reduces that year's fee", () => {
  const list = choices({
    effective_state: "honorary",
    honorary_memberships: [{ status: "scheduled", effective_from: "2020-01-01", revoked_effective_on: "2027-07-01", replacement_plan_id: adult }],
  });
  assert.equal(forYear(list, 2027).amount_pence, Math.round(4500 * 6 / 12));
  assert.match(forYear(list, 2027).note, /Reduced from the £45\.00 annual fee/);
});

test("works out age from a date of birth", () => {
  assert.equal(ageOn("2009-03-03", "2026-09-19"), 17);
  assert.equal(ageOn("2009-09-19", "2026-09-19"), 17);
  assert.equal(ageOn("2008-09-19", "2026-09-19"), 18);
  assert.equal(ageOn("2008-09-20", "2026-09-19"), 17);
  assert.equal(ageOn("2008-02-29", "2026-02-28"), 17);
  assert.equal(ageOn("2008-02-29", "2026-03-01"), 18);
  assert.equal(ageOn(null, "2026-09-19"), null);
  assert.equal(ageOn("", "2026-09-19"), null);
});

test("keeps what an officer typed when adding a member fails", () => {
  const form = new FormData();
  form.set("full_name", "Ada Lovelace");
  form.set("payment_received", "on");
  form.set("$ACTION_ID_abc", "hidden framework field");
  form.set("upload", new File(["x"], "x.txt"));
  assert.deepEqual(submittedValues(form), { full_name: "Ada Lovelace", payment_received: "on" });
  assert.deepEqual(emptyOfficerMemberState, { error: null, attempt: 0, values: {}, created: null });
  assert.match(membershipErrorMessage("possible-duplicate"), /highlighted box/);
  assert.equal(membershipErrorMessage("something-unknown"), null);
  assert.equal(membershipErrorMessage(null), null);
});

test("records how and when an officer-added member agreed to the newsletter", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202609180001_officer_newsletter_consent.sql", import.meta.url), "utf8");
  assert.match(migration, /newsletter_consent_source/);
  assert.match(migration, /newsletter_consent_recorded_by_actor_id/);
  assert.match(migration, /drop function public\.create_officer_managed_membership\(/);
  assert.match(migration, /membership_newsletter_email_required/);
  assert.match(migration, /membership_newsletter_consent_evidence_required/);
  assert.match(migration, /'newsletter_opt_in',v_newsletter/);
  assert.match(migration, /grant execute on function public\.create_officer_managed_membership\(.*boolean,text,date\)/);
});

test("capitalises each part of a name without lowering letters already typed as capitals", () => {
  assert.equal(capitaliseName("alex smith"), "Alex Smith");
  assert.equal(capitaliseName("jane smith-jones"), "Jane Smith-Jones");
  assert.equal(capitaliseName("d'arcy o’neil"), "D'Arcy O’Neil");
  assert.equal(capitaliseName("Fiona McDonald"), "Fiona McDonald");
  assert.equal(capitaliseName("émile zola"), "Émile Zola");
  assert.equal(capitaliseName(""), "");
});

test("the renewals list shows who still has to renew and how the year is going", async () => {
  const { buildRenewalRows, summariseRenewals, filterRenewalRows, defaultRenewalYear, renewalStatusLine } = await import("../lib/membership-admin/renewals.ts");
  const member = (id, name, extra = {}) => ({ id, full_name: name, contact_email: `${id}@example.test`, effective_state: "active", plan_name: "Adult", ...extra });
  const members = [
    member("b", "Bea Waiting"), member("a", "Al Paid"), member("c", "Cy NoEmail", { contact_email: null }),
    member("d", "Di Checking"), member("e", "Ed Honorary"), member("f", "Flo Lapsed", { effective_state: "lapsed" }), member("g", "Gus Uninvited"),
  ];
  const choice = (id, amount, note = "Full annual fee for 2027.") => ({ member_id: id, membership_year: 2027, amount_pence: amount, note });
  const choices = [choice("a", null), choice("b", 4500), choice("c", 4500), choice("d", null), choice("e", null, "Honorary membership covers this year."), choice("f", 4500), choice("g", 4500),
    { member_id: "b", membership_year: 2026, amount_pence: 4500, note: "" }];
  const terms = [
    { member_id: "a", membership_year: 2027, status: "paid", amount_due_pence: 4500, amount_paid_pence: 4500 },
    { member_id: "d", membership_year: 2027, status: "payment_review", amount_due_pence: 4500, amount_paid_pence: 4500 },
    { member_id: "b", membership_year: 2026, status: "paid", amount_due_pence: 4500, amount_paid_pence: 4500 },
  ];
  const rows = buildRenewalRows({ year: 2027, members, choices, terms, invitedIds: ["a", "b", "c", "d", "e", "f"] });
  assert.deepEqual(rows.map((row) => [row.name, row.status]), [
    ["Al Paid", "renewed"], ["Bea Waiting", "waiting"], ["Cy NoEmail", "waiting"], ["Di Checking", "checking"],
    ["Ed Honorary", "blocked"], ["Flo Lapsed", "waiting"], ["Gus Uninvited", "waiting"],
  ]);
  const summary = summariseRenewals(rows);
  assert.deepEqual(summary, { invited: 6, renewed: 1, waiting: 5, waitingWithoutEmail: 1, remindable: 2, toInvite: 1 });
  assert.equal(renewalStatusLine({ open: true, summary }), "Open · 6 invited · 1 renewed · 5 waiting");
  assert.equal(renewalStatusLine({ open: false, summary }), "Not opened yet");
  assert.deepEqual(filterRenewalRows(rows, { show: "waiting", query: "" }).map((row) => row.id), ["b", "c", "d", "e", "f", "g"]);
  assert.deepEqual(filterRenewalRows(rows, { show: "renewed", query: "" }).map((row) => row.id), ["a"]);
  assert.deepEqual(filterRenewalRows(rows, { show: "all", query: "  NOEMAIL" }).map((row) => row.id), ["c"]);
  assert.deepEqual(filterRenewalRows(rows, { show: "all", query: "b@example" }).map((row) => row.id), ["b"]);
  assert.equal(defaultRenewalYear(2026, []), 2027);
  assert.equal(defaultRenewalYear(2026, [2026]), 2026);
  assert.equal(defaultRenewalYear(2026, [2026, 2027]), 2027);
  assert.equal(defaultRenewalYear(2026, [], "2026"), 2026);
  assert.equal(defaultRenewalYear(2026, [], "2030"), 2027);
});

test("the renewal reminder migration only reminds unpaid, invited members with an email", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609190001_membership_renewal_reminders.sql", import.meta.url), "utf8");
  assert.match(sql, /membership_renewal_campaigns where membership_year=p_year and open/);
  assert.match(sql, /m\.contact_email is not null/);
  assert.match(sql, /t\.status='paid' or t\.amount_paid_pence>0/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /grant execute on function public\.queue_membership_renewal_reminders\(integer,uuid\) to service_role/);
});

test("the fee in force is the latest active fee starting in or before the year", async () => {
  const { feeInForce } = await import("../lib/membership-admin/renewals.ts");
  const fee = (year, pence, version = 1, active = true, plan = "adult") => ({ plan_id: plan, membership_year: year, amount_pence: pence, version, active });
  const prices = [fee(2025, 4000), fee(2026, 4500), fee(2026, 4600, 2), fee(2028, 5000), fee(2026, 9900, 3, false), fee(2026, 100, 1, true, "junior")];
  assert.equal(feeInForce(prices, "adult", 2026)?.amount_pence, 4600);
  assert.equal(feeInForce(prices, "adult", 2027)?.amount_pence, 4600);
  assert.equal(feeInForce(prices, "adult", 2028)?.amount_pence, 5000);
  assert.equal(feeInForce(prices, "adult", 2024), null);
  assert.equal(feeInForce(prices, "student", 2026), null);
});

test("renewal emails say what the link is for and when it stops working", async () => {
  const [sql, worker] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609190002_membership_renewal_email_wording.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/deliver-membership-notifications/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /is due for renewal for/);
  assert.match(sql, /nothing is set up to charge you again/);
  assert.match(sql, /The link works until 31 December/);
  assert.match(sql, /Reminder: please renew/);
  assert.match(sql, /queue_membership_renewal_invitation/);
  assert.match(sql, /queue_membership_renewal_reminders/);
  assert.match(worker, /membership\.renewal-invitation/);
  assert.match(worker, /Renew my membership/);
  assert.match(worker, /Open membership account/);
});

test("renewal emails quote the fee for the member's next type and list the other ways to pay", async () => {
  const [sql, page] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609190003_membership_renewal_email_details.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/membership/renew/page.tsx", import.meta.url), "utf8"),
  ]);
  // The fee follows any scheduled or approved plan change, and a pending Student request quotes nothing.
  assert.match(sql, /coalesce\(t\.to_plan_id,m\.current_plan_id\)/);
  assert.match(sql, /awaiting_student_review/);
  assert.match(sql, /Your membership type changes from/);
  // Placeholder settings are never emailed.
  assert.match(sql, /active and configured/);
  assert.match(sql, /Bank transfer/);
  assert.match(sql, /Cheque/);
  assert.match(sql, /Cash/);
  // Both the invitation and the reminder use them.
  assert.equal((sql.match(/membership_renewal_other_ways_text\(/g) ?? []).length >= 3, true);
  assert.match(page, /awaiting_student_review/);
  assert.match(page, /Your membership type is being reviewed/);
});

test("an age change is priced at the new type's fee before it has been recorded", () => {
  assert.equal(ageTransitionSlug("junior", "2008-06-01", 2027), "adult");
  assert.equal(ageTransitionSlug("junior", "2009-06-01", 2027), null);
  assert.equal(ageTransitionSlug("student", "2002-01-01", 2027), "adult");
  assert.equal(ageTransitionSlug("adult", "1947-01-01", 2027), "concession");
  assert.equal(ageTransitionSlug("adult", "1947-01-02", 2027), null);
  assert.equal(ageTransitionSlug("concession", "1940-01-01", 2027), null);
  assert.equal(ageTransitionSlug("junior", null, 2027), null);
  const junior = "plan-junior";
  const plans = [{ id: junior, slug: "junior" }, { id: adult, slug: "adult" }];
  const withJunior = [...prices, { plan_id: junior, membership_year: 2026, amount_pence: 1000 }];
  const list = choices({ current_plan_id: junior, date_of_birth: "2008-06-01" }, { prices: withJunior, plans });
  assert.equal(forYear(list, 2027).amount_pence, 4500);
  // A change that is already recorded, or a member still under 18, is left alone.
  const recorded = choices({ current_plan_id: junior, date_of_birth: "2008-06-01" }, { prices: withJunior, plans, transitions: [{ member_id: "m1", membership_year: 2027, status: "awaiting_student_review", to_plan_id: adult }] });
  assert.equal(forYear(recorded, 2027).amount_pence, null);
  const younger = choices({ current_plan_id: junior, date_of_birth: "2010-06-01" }, { prices: withJunior, plans });
  assert.equal(forYear(younger, 2027).amount_pence, 1000);
});

test("payments and checkout record any age change before they read the fee", async () => {
  const [sql, actions, checkout] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609190004_ensure_membership_age_transition.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/actions/membership.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/membership.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /on conflict\(member_id,membership_year\) do nothing/);
  assert.match(sql, /grant execute on function public\.ensure_membership_age_transition\(uuid,integer\) to service_role/);
  for (const source of [actions, checkout]) {
    const call = source.indexOf("ensure_membership_age_transition");
    assert.ok(call > 0);
    assert.ok(call < source.indexOf('.from("membership_plan_transitions")', call));
  }
});
