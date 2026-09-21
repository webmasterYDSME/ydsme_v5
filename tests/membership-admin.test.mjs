import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { legacyMembershipRedirect } from "../lib/membership-admin/legacy-urls.ts";
import { membershipErrorMessage } from "../lib/membership-admin/messages.ts";
import { emptyOfficerMemberState, submittedValues } from "../lib/membership-admin/officer-member.ts";
import { ageOn, capitaliseName, dateLabel, dateTimeLabel, memberStateName, money, paymentMethodName, timestampDateLabel, waitingLabel } from "../lib/membership-admin/format.ts";
import { parseRenewalBody, renewalHtml, renewalText } from "../supabase/functions/deliver-membership-notifications/renewal-email.ts";
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

const renewalBody = [
  "Clifford Junior Test membership for the year of 2027 has not been renewed yet.",
  "Membership: Adult\nFee for 2027: £30.00\nYour membership type changes from Junior to Adult for 2027.",
  "Pay by bank transfer (preferred)\nThe preferred way to pay.\nAccount name: York & District <Society>\nSort code: 12-34-56\nAccount number: 12345678\nAmount: £30.00\nReference: Clifford Junior Test",
  "Pay by card\nUse your personal link.",
  "Pay by cheque\nPayable to: York Society\nPost it to the Treasurer: 1 Example Road.",
  "Pay by cash\nHand it to the Treasurer.",
  "If you have already paid, please contact the membership officer.",
].join("\n\n");

test("renewal emails list bank transfer first and put the renewal button with the card option", () => {
  const blocks = parseRenewalBody(renewalBody);
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "facts", "method", "method", "method", "method", "paragraph"]);
  const [bank, card, cheque] = blocks.filter((block) => block.type === "method");
  assert.equal(bank.name, "Pay by bank transfer");
  assert.equal(bank.preferred, true);
  assert.deepEqual(bank.rows.map(([label]) => label), ["Account name", "Sort code", "Account number", "Amount", "Reference"]);
  assert.equal(card.card, true);
  // Free text with a colon in it is not mistaken for a labelled detail.
  assert.deepEqual(cheque.rows, [["Payable to", "York Society"]]);
  assert.deepEqual(cheque.text, ["Post it to the Treasurer: 1 Example Road."]);

  const html = renewalHtml({ eyebrow: "Membership renewal", title: "Please renew your YDSME 2027 membership", body: renewalBody, actionUrl: "http://x/membership/renew?token=abc", buttonLabel: "Renew my membership" });
  assert.match(html, /Preferred/);
  assert.ok(html.indexOf("Pay by bank transfer") < html.indexOf("Pay by card"));
  assert.ok(html.indexOf("Pay by card") < html.indexOf("Pay by cheque"));
  // One button, inside the card block, before the cheque and cash blocks.
  assert.equal((html.match(/Renew my membership/g) ?? []).length, 1);
  assert.ok(html.indexOf("Renew my membership") < html.indexOf("Pay by cheque"));
  // Text from the database is escaped.
  assert.match(html, /York &amp; District &lt;Society&gt;/);
  assert.doesNotMatch(html, /<Society>/);

  const text = renewalText(renewalBody, "http://x/membership/renew?token=abc", "Renew online");
  assert.ok(text.indexOf("Renew online: http://x") > text.indexOf("Pay by card"));
  assert.ok(text.indexOf("Renew online: http://x") < text.indexOf("Pay by cheque"));
});

test("renewal emails queued in the older layout keep the simple layout", () => {
  const old = "Jo's membership is due.\n\nOther ways to pay\n\nBank transfer\nAccount name: X";
  assert.equal(parseRenewalBody(old), null);
  assert.equal(renewalHtml({ eyebrow: "e", title: "t", body: old, actionUrl: null, buttonLabel: "b" }), null);
  assert.equal(renewalText("plain", null, "Renew online"), "plain");
  assert.equal(renewalText(old, "http://x", "Renew online").endsWith("Renew online: http://x"), true);
});

test("the reminder subject and opening line, and the wider body limit, are in the layout migration", async () => {
  const [sql, worker] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609190005_membership_renewal_email_layout.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/deliver-membership-notifications/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /'Please renew your YDSME '\|\|p_year\|\|' membership'/);
  assert.match(sql, /membership for the year of '\|\|p_year\|\|' has not been renewed yet\./);
  assert.match(sql, /Pay by bank transfer \(preferred\)/);
  // Bank transfer is emitted first, then the card block, then cheque and cash.
  assert.ok(sql.indexOf("Pay by bank transfer") < sql.indexOf("||card"));
  assert.ok(sql.indexOf("||card") < sql.indexOf("Pay by cheque"));
  assert.match(sql, /char_length\(body\) between 2 and 4000/);
  assert.match(sql, /drop function if exists public\.membership_renewal_other_ways_text/);
  assert.match(worker, /renewalHtml\(/);
  assert.match(worker, /renewalText\(/);
});

test("renewal emails end with one short automated-email note", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609190006_membership_renewal_email_closing.sql", import.meta.url), "utf8");
  assert.match(sql, /This is an automated email\. If you have already paid, there is nothing you need to do\. The membership officer may not have recorded your payment yet\./);
  // The two older closing lines are gone from the reminder and the payment block.
  assert.doesNotMatch(sql, /your membership is renewed once the officer has recorded/);
  assert.doesNotMatch(sql, /so they can check your record/);
  const body = "Hello.\n\nPay by card\nUse the link.\n\nThis is an automated email. If you have already paid, there is nothing you need to do.";
  const blocks = parseRenewalBody(body);
  assert.equal(blocks.at(-1).type, "paragraph");
  const html = renewalHtml({ eyebrow: "e", title: "t", body, actionUrl: null, buttonLabel: "b" });
  assert.match(html, /font-size:14px;line-height:22px">This is an automated email/);
});

test("the local Stripe listener names every event the webhook handles", async () => {
  const [listener, webhook] = await Promise.all([
    readFile(new URL("../scripts/listen-local-stripe.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(listener, /"--events", events/);
  const handled = [...webhook.matchAll(/event\.type === "([a-z_.]+)"/g)].map((match) => match[1]);
  assert.ok(handled.length >= 10);
  for (const type of handled) assert.ok(listener.includes(`"${type}"`), `${type} is not forwarded`);
});

test("renewals skip members whose honorary membership covers the year", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609190007_membership_renewal_skip_honorary.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.membership_honorary_covers_year/);
  // The invitation and the reminder both check it, and it is used to close tasks already raised.
  assert.equal((sql.match(/membership_honorary_covers_year\((?:m\.id|n\.member_id),/g) ?? []).length, 3);
  assert.match(sql, /h\.status in \('scheduled','active'\)/);
  // Honorary membership that ends part-way through the year with a replacement type still owes a fee.
  assert.match(sql, /replacement_plan_id is not null/);
  assert.match(sql, /update public\.membership_notifications n set read_at=now\(\)/);
});

test("contact tasks say why the member has to be contacted", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609190008_membership_manual_contact_reasons.sql", import.meta.url), "utf8");
  // The task starts with the reason and carries the notice that could not be sent.
  assert.match(sql, /when 'membership\.lapsed' then 'Membership has lapsed'/);
  assert.match(sql, /The message they would have received/);
  assert.doesNotMatch(sql, /'Manual member contact required',/);
  // Tasks already open under the old wording are rewritten.
  assert.match(sql, /t\.title='Manual member contact required'/);
  // The Inbox lists every different reason for a member rather than only the latest.
  const inbox = readFileSync(new URL("../lib/membership-admin/inbox.ts", import.meta.url), "utf8");
  assert.match(inbox, /function contactTasks/);
  assert.match(inbox, /items\.includes\(text\)/);
});

test("officers can clear refund and email delivery problems", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609190009_membership_problem_clearing.sql", import.meta.url), "utf8");
  // The refund is recorded against every payment with money left, only for a denied membership, only by an officer.
  assert.match(sql, /manual_verification='denied'/);
  assert.match(sql, /has_membership_management_capability\(p_actor\)/);
  assert.match(sql, /refunded_pence=p\.amount_pence, status='refunded'/);
  assert.match(sql, /add column if not exists resolved_at/);
  const inbox = readFileSync(new URL("../lib/membership-admin/inbox.ts", import.meta.url), "utf8");
  // Cleared delivery problems no longer come back, and the refund task knows which application it is for.
  assert.match(inbox, /\.is\("resolved_at", null\)/);
  assert.match(inbox, /applicationId: application\.id/);
  const panel = readFileSync(new URL("../app/admin/memberships/_components/InboxTaskPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /recordDeniedMembershipRefund/);
  assert.match(panel, /resolveMembershipDeliveryProblem/);
  assert.match(panel, />Mark as refunded</);
});

test("the result message floats on screen and every notice has its own wording", async () => {
  const toast = readFileSync(new URL("../app/admin/memberships/_components/FlashToast.tsx", import.meta.url), "utf8");
  // A success fades, an error waits to be closed, and closing removes the codes from the address.
  assert.match(toast, /SUCCESS_MS/);
  assert.match(toast, /role=\{isError \? "alert" : "status"\}/);
  assert.match(toast, /searchParams\.delete\("notice"\)/);
  // Wording that used to sit in the old banner now lives with the other messages.
  const { membershipNoticeMessage } = await import("../lib/membership-admin/messages.ts");
  assert.equal(membershipNoticeMessage("membership-payment-settings-saved"), "Payment details saved.");
  assert.match(membershipNoticeMessage("price-unchanged"), /No fee change was needed/);
  // Every notice the membership screens can redirect with has specific wording, not the generic fallback.
  const actions = readFileSync(new URL("../lib/actions/membership.ts", import.meta.url), "utf8");
  const skip = new Set(["offline-payment-"]);
  for (const [, code] of actions.matchAll(/\/admin\/memberships[^"`]*[?&]notice=([a-z0-9-]+)/g)) {
    if (!skip.has(code)) assert.ok(membershipNoticeMessage(code), `no wording for notice ${code}`);
  }
});

test("the renewal page thanks a member who has paid", () => {
  const page = readFileSync(new URL("../app/membership/renew/page.tsx", import.meta.url), "utf8");
  assert.match(page, /title=\{`Thank you, \$\{member\.full_name\.trim\(\)\.split\(\/\\s\+\/\)\[0\]\}\.`\}/);
  assert.match(page, /Your membership renewal for the year \{year\} is successful\./);
  assert.doesNotMatch(page, /There is nothing more to do\. Thank you\./);
});

test("an unpaid offline application can be closed by an officer without emailing the applicant", () => {
  const actions = readFileSync(new URL("../lib/actions/membership.ts", import.meta.url), "utf8");
  const body = actions.slice(actions.indexOf("export async function closeOfflineMembershipApplication"), actions.indexOf("export async function confirmOfflineMembership"));
  assert.match(body, /\.in\("status", \["awaiting_cash", "awaiting_bank_transfer", "awaiting_cheque"\]\)/);
  assert.match(body, /min\(5\)/);
  assert.doesNotMatch(body, /membership_notifications/);
  const panel = readFileSync(new URL("../app/admin/memberships/_components/InboxTaskPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /closeOfflineMembershipApplication/);
});

test("the activation email explains a missing website login in plain words, in its own paragraph", () => {
  const source = readFileSync(new URL("../lib/membership.ts", import.meta.url), "utf8");
  assert.match(source, /`\$\{notice\.body\}\\n\\n\$\{extraBody\}`/);
  assert.match(source, /There is no website login for this membership yet, because this email address is already used for another login\./);
  assert.match(source, /No website login has been set up for this membership\./);
  assert.doesNotMatch(source, /officer-confirmed portal assignment/);
  assert.doesNotMatch(source, /correspondence email already has a website login/);
});

test("the renewal link's last day in the email comes from the same rule that expires the invitation", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609210001_membership_renewal_link_expiry_and_manual_reminders.sql", import.meta.url), "utf8");
  // One rule sets the expiry: the start of 1 January after the renewal year, London time.
  assert.match(sql, /function public\.membership_renewal_link_expires_at\(p_year integer\)[\s\S]*make_timestamptz\(p_year\+1,1,1,0,0,0,'Europe\/London'\)/);
  assert.match(sql, /values\(m\.id,p_year,p_token_hash,public\.membership_renewal_link_expires_at\(p_year\)\)/);
  // The email reads the invitation's stored expiry and only falls back to the rule, and no date is typed into the wording.
  assert.match(sql, /i\.expires_at from public\.membership_renewal_invitations i where i\.member_id=p_member_id and i\.membership_year=p_year/);
  assert.match(sql, /The link works until '\|\|public\.membership_renewal_link_last_day_text\(p_member_id,p_year\)\|\|'\./);
  assert.doesNotMatch(sql, /until 31 December/);
  // The wording is otherwise the same as before: the payment blocks and the closing note are still there.
  assert.match(sql, /Pay by bank transfer \(preferred\)/);
  assert.match(sql, /This is an automated email\. If you have already paid/);
});

test("renewal reminders are only sent by an officer: no scheduled stages, no reminders in the daily job", async () => {
  const [sql, overview, inbox] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609210001_membership_renewal_link_expiry_and_manual_reminders.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/memberships/_components/RenewalsOverview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/membership-admin/inbox.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /drop function if exists public\.run_membership_renewal_reminder_schedule\(date\)/);
  assert.match(sql, /drop function if exists public\.queue_membership_renewal_reminders_core\(integer, text, date, integer\)/);
  const catchUp = sql.slice(sql.indexOf("function public.run_membership_daily_catch_up"), sql.indexOf("drop function if exists public.run_membership_renewal_reminder_schedule"));
  assert.match(catchUp, /run_membership_retention\(p_today\)/);
  assert.doesNotMatch(catchUp, /reminder/);
  // The officer's button keeps its rules.
  assert.match(sql, /function public\.queue_membership_renewal_reminders\(p_year integer, p_actor uuid\)/);
  assert.match(sql, /membership_renewal_campaigns where membership_year = p_year and open/);
  assert.match(sql, /invitation_notice\.email_status = 'sent'/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /m\.effective_state in \('active', 'grace', 'lapsed'\)/);
  assert.match(sql, /grant execute on function public\.queue_membership_renewal_reminders\(integer, uuid\) to service_role/);
  // Nothing on the officer's screens promises automatic reminders any more.
  assert.doesNotMatch(overview, /go out by themselves|1 December|22 February/);
  assert.doesNotMatch(inbox, /1 December, 1 January, 1 February/);
  assert.match(overview, /Nothing is sent automatically/);
});

test("the grace period is one rule that the link, the stored grace end and the daily job read", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609210002_membership_grace_rule.sql", import.meta.url), "utf8");
  // The rule, and the link expiry built on it.
  assert.match(sql, /function public\.membership_grace_ends_on\(p_year integer\)[\s\S]*?select make_date\(p_year,3,1\)/);
  assert.match(sql, /function public\.membership_renewal_link_expires_at\(p_year integer\)[\s\S]*?public\.membership_grace_ends_on\(p_year\)::timestamp\) at time zone 'Europe\/London'/);
  // Every new term stores the grace end from the rule, whatever the calling function passes.
  assert.match(sql, /new\.grace_ends_on := public\.membership_grace_ends_on\(new\.membership_year\+1\)/);
  assert.match(sql, /create trigger membership_terms_set_grace_end before insert on public\.membership_terms/);
  // The daily job lapses on the rule's date, not on a typed 1 March, and the grace notice names it.
  assert.match(sql, /if p_today = public\.membership_grace_ends_on\(v_year\) then/);
  assert.doesNotMatch(sql, /extract\(month from p_today\) = 3/);
  assert.match(sql, /current_date < public\.membership_grace_ends_on\(extract\(year from current_date\)::integer\)/);
  assert.match(sql, /public\.membership_grace_ends_on\(v_year\+1\)/);
  // Outside the rule function and comments, no function body types the date in again.
  const code = sql.replace(/--.*$/gm, "");
  assert.equal((code.match(/make_date\([^)]*,\s*3\s*,\s*1\)/g) ?? []).length, 1);
  assert.doesNotMatch(code, /before 1 March|through February|,2,28\)/);
});

test("the expired renewal page points the member to the officer, who can send a new link", async () => {
  const page = await readFile(new URL("../app/membership/renew/page.tsx", import.meta.url), "utf8");
  assert.match(page, /This renewal link has expired/);
  assert.match(page, /contact the membership officer, who can send you a new link/);
});

test("the officer's new renewal link lasts 30 days, is audited, and only lapsed members can be sent one", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609210003_membership_returning_member_fee_and_new_link.sql", import.meta.url), "utf8");
  const action = await readFile(new URL("../lib/actions/membership-renewals.ts", import.meta.url), "utf8");
  const messages = await readFile(new URL("../lib/membership-admin/messages.ts", import.meta.url), "utf8");
  const memberPage = await readFile(new URL("../app/admin/memberships/members/[id]/page.tsx", import.meta.url), "utf8");
  const renewalsPage = await readFile(new URL("../app/admin/memberships/renewals/page.tsx", import.meta.url), "utf8");
  // 30 days counting today, never shortening a longer link; officer only; lapsed only; renewals must be open.
  assert.match(sql, /\(v_today\+31\)::timestamp\) at time zone 'Europe\/London'/);
  assert.match(sql, /greatest\(/);
  assert.match(sql, /has_membership_management_capability\(p_actor\)/);
  assert.match(sql, /m\.effective_state<>'lapsed'/);
  assert.match(sql, /membership_renewal_campaigns where membership_year=p_year and open/);
  assert.match(sql, /membership\.renewal-link-reissued/);
  assert.match(sql, /grant execute on function public\.reissue_membership_renewal_link\(uuid,integer,uuid,text,text\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.reissue_membership_renewal_link[^;]*(authenticated|anon)/);
  // It is one email the officer asked for, so it does not wait in the bulk queue.
  assert.match(sql, /deduplication_key like 'renewal-link-%' then 'immediate'/);
  // The screens: a button on the member record and on the Renewals list, and every result has a message.
  assert.match(action, /export async function sendNewRenewalLink/);
  assert.match(action, /rpc\("reissue_membership_renewal_link"/);
  assert.match(memberPage, /Send new renewal link/);
  assert.match(renewalsPage, /Send new link/);
  for (const key of ["renewal-link-sent", "renewal-link-not-open", "renewal-link-no-email", "renewal-link-unavailable", "renewal-link-failed"]) {
    assert.ok(messages.includes(`"${key}"`), `${key} has a message`);
    assert.ok(action.includes(key), `${key} is used`);
  }
});

test("a returning member's fee is worked out in one place and every payment route follows it", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609210003_membership_returning_member_fee_and_new_link.sql", import.meta.url), "utf8");
  const membership = await readFile(new URL("../lib/membership.ts", import.meta.url), "utf8");
  const offline = await readFile(new URL("../lib/actions/membership.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/membership/renew/page.tsx", import.meta.url), "utf8");
  // Same rule as a new member, for a lapsed member paying for the current year only.
  assert.match(sql, /m\.effective_state='lapsed'[\s\S]*?p_year=extract\(year from p_on\)::integer[\s\S]*?prorated_membership_fee_pence\(p_annual_pence,p_on\)/);
  // The email quote, the offline entry, and the card payment (checked against the checkout's own month) all use it.
  assert.match(sql, /fee_pence:=public\.membership_returning_member_fee_pence\(/);
  assert.match(sql, /else public\.membership_returning_member_fee_pence\(p_member_id,p_membership_year,v_price\.amount_pence,p_received_on\) end/);
  assert.match(sql, /attempt\.stripe_checkout_session_id=p_stripe_checkout_session_id/);
  assert.match(sql, /p_amount_pence not in \(v_expected,v_returning\)/);
  // The website charges, shows and defaults to the same amount.
  assert.match(membership, /returningMemberFee\(\{ effectiveState: member\.effective_state/);
  assert.match(offline, /returningMemberFee\(\{ effectiveState: member\.effective_state/);
  assert.match(page, /returningMemberFee\(/);
});

test("a lapsed member is told what to do next, in the email and when they try to sign in", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202609210003_membership_returning_member_fee_and_new_link.sql", import.meta.url), "utf8");
  const auth = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
  const signin = await readFile(new URL("../app/signin/page.tsx", import.meta.url), "utf8");
  assert.match(sql, /contact the membership officer, who will send you a new renewal link/);
  assert.doesNotMatch(sql, /online or offline renewal can reinstate/);
  assert.match(sql, /case when new\.effective_state='lapsed' then null else '\/account' end/);
  assert.match(auth, /membership_status === "lapsed"\) redirect\(`\/signin\?error=\$\{encodeURIComponent\(LAPSED_ACCESS_MESSAGE\)\}`\)/);
  assert.match(auth, /Please contact the membership officer, who will send you a new link to renew/);
  assert.match(signin, /LAPSED_ACCESS_MESSAGE/);
});
