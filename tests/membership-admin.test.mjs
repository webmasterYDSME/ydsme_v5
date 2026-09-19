import assert from "node:assert/strict";
import test from "node:test";
import { legacyMembershipRedirect } from "../lib/membership-admin/legacy-urls.ts";
import { ageOn, dateLabel, memberStateName, money, paymentMethodName, waitingLabel } from "../lib/membership-admin/format.ts";
import { buildRenewalChoices, renewableMembers } from "../lib/membership-rules.ts";

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
    [{ section: "plans", notice: "price-saved" }, "/admin/memberships/setup?notice=price-saved&tab=fees"],
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
  assert.equal(legacyMembershipRedirect({ view: "plans" }), "/admin/memberships/setup?tab=fees");
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
  assert.match(dateLabel("2026-09-18"), /^18 Sept? 2026$/);
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
