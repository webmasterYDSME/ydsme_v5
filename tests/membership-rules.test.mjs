import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ageOn,
  defaultMembershipPlan,
  eligibleMembershipPlans,
  membershipBillingYear,
  membershipRenewalAt,
  proratedMembershipFee,
} from "../lib/membership-rules.ts";
import { readMembershipAdminSource } from "./membership-admin-source.mjs";
import { readAccountSource } from "./account-source.mjs";

const eligibilityPlans = [
  { id: "junior", slug: "junior", minimum_age: 14, maximum_age: 17 },
  { id: "student", slug: "student", minimum_age: 18, maximum_age: 24 },
  { id: "adult", slug: "adult", minimum_age: 18, maximum_age: 79 },
  { id: "concession", slug: "concession", minimum_age: 80, maximum_age: 120 },
];

test("prorates annual membership by inclusive remaining calendar months", () => {
  const annual = 6000;
  const expected = [6000, 5500, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 6000];
  for (let month = 0; month < 12; month += 1) {
    assert.equal(proratedMembershipFee(annual, new Date(Date.UTC(2026, month, 20))), expected[month]);
  }
});

test("rounds prorated fees to the nearest penny and gives December to the following full term", () => {
  assert.equal(proratedMembershipFee(3001, new Date(Date.UTC(2026, 7, 1))), 1250);
  assert.equal(proratedMembershipFee(1500, new Date(Date.UTC(2026, 11, 31))), 1500);
  assert.equal(membershipBillingYear(new Date(Date.UTC(2026, 10, 30))), 2026);
  assert.equal(membershipBillingYear(new Date(Date.UTC(2026, 11, 1))), 2027);
  assert.equal(membershipRenewalAt(2027).toISOString(), "2028-01-01T00:00:00.000Z");
});

test("calculates exact age boundaries without local-time drift", () => {
  assert.equal(ageOn("2008-08-20", new Date("2026-08-20T00:00:00Z")), 18);
  // Ages follow the London date, so the last second of 20 August in London (22:59:59 UTC in summer) is still the 20th.
  assert.equal(ageOn("2008-08-21", new Date("2026-08-20T22:59:59Z")), 17);
  assert.equal(ageOn("2008-08-21", new Date("2026-08-20T23:00:00Z")), 18);
  assert.equal(ageOn("1946-08-20", new Date("2026-08-20T12:00:00Z")), 80);
});

test("automatically selects age-based membership and defaults overlaps to Adult", () => {
  const onDate = new Date("2026-08-20T12:00:00Z");
  const junior = eligibleMembershipPlans(eligibilityPlans, "2012-08-20", onDate);
  const overlap = eligibleMembershipPlans(eligibilityPlans, "2008-08-20", onDate);
  const adult = eligibleMembershipPlans(eligibilityPlans, "2000-08-20", onDate);
  const concession = eligibleMembershipPlans(eligibilityPlans, "1946-08-20", onDate);

  assert.equal(defaultMembershipPlan(junior.plans)?.slug, "junior");
  assert.deepEqual(overlap.plans.map((plan) => plan.slug), ["student", "adult"]);
  assert.equal(defaultMembershipPlan(overlap.plans)?.slug, "adult");
  assert.equal(defaultMembershipPlan(adult.plans)?.slug, "adult");
  assert.equal(defaultMembershipPlan(concession.plans)?.slug, "concession");
});

test("membership integration uses hosted Checkout, verified webhooks and entitlement-only honorary grants", async () => {
  const root = new URL("../", import.meta.url);
  const [membership, webhook, workflows, reversals, operations, serviceGrant, zeroValueGuard, atomicActivation] = await Promise.all([
    readFile(new URL("lib/membership.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200003_membership_workflows.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200004_membership_reversals_and_delivery.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200006_membership_operations.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200014_membership_plan_service_grant.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200036_membership_zero_value_invoice_guard.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608210006_membership_atomic_activation_remediation.sql", root), "utf8"),
  ]);
  assert.match(membership, /mode: "payment"/);
  assert.doesNotMatch(membership, /trial_end:/);
  assert.doesNotMatch(membership, /subscription_data:\s*\{[\s\S]{0,180}proration_behavior:/);
  assert.match(membership, /membership_checkout_attempt_id/);
  assert.match(membership, /reserveCheckoutAttempt/);
  assert.doesNotMatch(membership, /payment_method_types/);
  assert.match(membership, /integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER/);
  assert.match(membership, /No automatic renewal payment will be taken\./);
  assert.match(webhook, /constructEvent\(payload, signature, webhookSecret\)/);
  assert.match(webhook, /session\.subscription/);
  assert.match(webhook, /stripe_subscription_id:/);
  assert.match(webhook, /activate_membership_application/);
  assert.match(atomicActivation, /membership_checkout_attempts set status='complete'/);
  assert.match(atomicActivation, /membership\.duplicate-payment-officer/);
  assert.match(webhook, /invoice\.amount_due === 0 && invoice\.amount_paid === 0/);
  assert.match(webhook, /\.eq\("stripe_invoice_id", invoice\.id\)/);
  assert.match(webhook, /if \(recordedCheckoutPayment\) return true/);
  assert.match(webhook, /membership-invoice-notice-\$\{invoice\.id\}-\$\{noticeKind\}/);
  assert.match(webhook, /activate_membership_application/);
  assert.match(webhook, /activate_membership_renewal/);
  assert.match(workflows, /grant_lifetime_honorary_membership/);
  const honoraryBody = workflows.split("create or replace function public.grant_lifetime_honorary_membership")[1]
    .split("create or replace function public.revoke_lifetime_honorary_membership")[0];
  assert.doesNotMatch(honoraryBody, /insert into public\.membership_payments/);
  assert.match(reversals, /status = 'payment_review'/);
  assert.match(operations, /plan\.slug='junior'/);
  assert.match(operations, /new\.membership_status in \('suspended','archived'\)/);
  assert.match(serviceGrant, /grant select on public\.public_membership_plans to service_role/);
  assert.match(zeroValueGuard, /p_amount_paid_pence <= 0 then return v_member\.id/);
});

test("keeps applications safe when online Checkout cannot be created", async () => {
  const root = new URL("../", import.meta.url);
  const [membership, verificationRoute, checkoutRoute, applicationPage, officerPage] = await Promise.all([
    readFile(new URL("lib/membership.ts", root), "utf8"),
    readFile(new URL("app/membership/verify/route.ts", root), "utf8"),
    readFile(new URL("app/membership/checkout/page.tsx", root), "utf8"),
    readFile(new URL("app/membership/apply/page.tsx", root), "utf8"),
    readMembershipAdminSource(),
  ]);
  assert.match(membership, /class MembershipCheckoutUnavailableError/);
  assert.match(membership, /membership\.application-payment-unavailable/);
  assert.match(membership, /membership\.application-payment-attention-officer/);
  assert.match(membership, /No payment has been taken/);
  assert.match(membership, /action_href: resumeHref/);
  assert.match(membership, /createApplicationCheckout\(data\.id, `\/membership\/checkout\?token=/);
  assert.match(membership, /ignoreDuplicates: true/);
  assert.match(membership, /resolveApplicationCheckoutProblems/);
  assert.match(membership, /auth\/invite\?next=\/account/);
  assert.doesNotMatch(membership, /membership_active: true[\s\S]{0,240}next=\/reset-password/);
  const checkoutAttempt = verificationRoute.indexOf("createApplicationCheckout(application.id");
  const unavailableRedirect = verificationRoute.indexOf("payment-unavailable", checkoutAttempt);
  const paymentReminder = verificationRoute.indexOf("membership.application-payment-reminder");
  assert.ok(checkoutAttempt >= 0 && checkoutAttempt < unavailableRedirect && unavailableRedirect < paymentReminder);
  assert.match(checkoutRoute, /getApplicationCheckoutSummaryFromToken/);
  assert.match(checkoutRoute, /continueApplicationCheckout/);
  assert.match(applicationPage, /"payment-unavailable"[\s\S]*Application safely saved/);
  // Payment problems are Inbox tasks: setup gaps, failed checkouts and unrecorded confirmations all appear there.
  const inbox = await readFile(new URL("lib/membership-admin/inbox.ts", root), "utf8");
  assert.match(inbox, /Online payments are not fully set up/);
  assert.match(inbox, /membership\.application-payment-attention-officer/);
  assert.match(inbox, /Payment page could not be opened/);
  assert.match(inbox, /Confirmed payment could not be recorded/);
  assert.match(officerPage, /Online payments and email are working/);
});

test("keeps annual fees prominent while hiding rarely changed membership rules", async () => {
  const [officerPage, actions] = await Promise.all([
    readMembershipAdminSource(),
    readFile(new URL("../lib/actions/membership.ts", import.meta.url), "utf8"),
  ]);
  assert.match(officerPage, /Membership types and fees/);
  assert.match(officerPage, /A fee carries on from year to year/);
  assert.match(officerPage, /Save fee/);
  assert.match(officerPage, /Edit type/);
  assert.match(officerPage, /Save membership type/);
  assert.doesNotMatch(officerPage, /Save new annual fee/);
  assert.match(actions, /renewals\?notice=price-saved/);
  assert.match(actions, /renewals\?notice=plan-updated/);
  assert.match(actions, /renewals\?error=price-save-failed/);
});

test("carries unchanged annual fees forward and delays future Stripe price changes", async () => {
  const root = new URL("../", import.meta.url);
  const [migration, membership, actions, webhook, officerPage] = await Promise.all([
    readFile(new URL("supabase/migrations/202608210001_membership_price_carry_forward.sql", root), "utf8"),
    readFile(new URL("lib/membership.ts", root), "utf8"),
    readFile(new URL("lib/actions/membership.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readMembershipAdminSource(),
  ]);
  assert.match(migration, /ensure_membership_plan_price/);
  assert.match(migration, /carried_forward_from_id/);
  assert.match(migration, /candidate\.membership_year <= public\.membership_billing_year/);
  assert.match(migration, /roll-forward-membership-prices/);
  assert.match(membership, /ensureMembershipPlanPrice\(checkoutApplication\.requested_plan_id, billingYear\)/);
  assert.match(membership, /ensureMembershipPlanPrice\(renewalPlanId, membershipYear\)/);
  assert.match(actions, /nextChargeYear !== null && nextChargeYear >= year/);
  assert.match(actions, /not\("carried_forward_from_id", "is", null\)/);
  assert.match(actions, /effectivePrice\?\.amount_pence === amountPence/);
  assert.match(actions, /notice=price-unchanged/);
  assert.match(webhook, /ensureMembershipPlanPrice\(pricedMember\.current_plan_id, invoiceYear \+ 1\)/);
  assert.match(webhook, /proration_behavior: "none"/);
  assert.match(officerPage, /Change it only when the amount changes/);
  assert.match(officerPage, /carried on/);
});

test("shows a single paid membership amount because partial payments are unsupported", async () => {
  const accountPage = await readAccountSource();
  assert.match(accountPage, /<dt>Paid<\/dt><dd>\{money\(term\.amount_paid_pence\)\}<\/dd>/);
  assert.match(accountPage, /term\.amount_paid_pence !== term\.amount_due_pence/);
});

test("keeps officer contact and renewal work safe and understandable", async () => {
  const root = new URL("../", import.meta.url);
  const [officerPage, renewalForm, actions] = await Promise.all([
    readMembershipAdminSource(),
    readFile(new URL("app/admin/memberships/_components/MemberPaymentPanel.tsx", root), "utf8"),
    readFile(new URL("lib/actions/membership.ts", root), "utf8"),
  ]);
  const inbox = await readFile(new URL("lib/membership-admin/inbox.ts", root), "utf8");
  assert.match(inbox, /function onePerMember[\s\S]*Array\.from\(new Map/);
  assert.match(officerPage, /Mark as contacted/);
  assert.match(officerPage, /Each person appears once/);
  assert.match(renewalForm, /Amount to record/);
  assert.match(renewalForm, /No payment due/);
  assert.match(actions, /membership-year-already-paid/);
  assert.match(actions, /honorary-year-no-payment/);
  assert.match(actions, /payment-review-required/);
});

test("uses the junior applicant name in guardian consent messages without claiming an extra email was sent", async () => {
  const root = new URL("../", import.meta.url);
  const [verificationRoute, actions, guardianPage] = await Promise.all([
    readFile(new URL("app/membership/verify/route.ts", root), "utf8"),
    readFile(new URL("lib/actions/membership.ts", root), "utf8"),
    readFile(new URL("app/membership/guardian-consent/page.tsx", root), "utf8"),
  ]);
  assert.match(verificationRoute, /application\.full_name \|\| "A junior applicant"/);
  assert.doesNotMatch(verificationRoute, /application\.guardian_name \|\| "A junior applicant"/);
  assert.match(actions, /application\.full_name \|\| "A junior applicant"/);
  assert.doesNotMatch(actions, /application\.guardian_name \|\| "A junior applicant"/);
  assert.match(guardianPage, /application is ready for a membership officer to review before payment/);
  assert.doesNotMatch(guardianPage, /applicant has been notified/);
});

test("supports verified public applications and auditable officer-managed offline membership", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, workflows, guards, actions, membershipCore, applicationPage, applicationWizard, eligibilityFields, officerEligibilityFields, guardianPage, settingsPage] = await Promise.all([
    readFile(new URL("supabase/migrations/202608200023_membership_offline_payments_and_actor_history.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200024_membership_officer_and_offline_workflows.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200025_membership_guardian_and_offboarding_guards.sql", root), "utf8"),
    readFile(new URL("lib/actions/membership.ts", root), "utf8"),
    readFile(new URL("lib/membership.ts", root), "utf8"),
    readFile(new URL("app/membership/apply/page.tsx", root), "utf8"),
    readFile(new URL("app/membership/apply/MembershipApplicationWizard.tsx", root), "utf8"),
    readFile(new URL("app/membership/apply/MembershipEligibilityFields.tsx", root), "utf8"),
    readFile(new URL("app/admin/memberships/OfficerMembershipEligibilityFields.tsx", root), "utf8"),
    readFile(new URL("app/membership/guardian-consent/page.tsx", root), "utf8"),
    readFile(new URL("app/settings/page.tsx", root), "utf8"),
  ]);
  assert.match(schema, /'stripe','cash','bank_transfer','cheque'/);
  assert.match(schema, /create table public\.administrative_actors/);
  assert.match(schema, /create table public\.membership_payment_settings_versions/);
  assert.match(workflows, /create_officer_managed_membership/);
  assert.match(workflows, /activate_offline_membership_application/);
  assert.match(workflows, /record_offline_application_payment/);
  assert.match(guards, /membership_guardian_progress_check/);
  assert.match(guards, /Former membership officer/);
  assert.match(actions, /confirmGuardianMembershipConsent/);
  assert.match(actions, /resendMembershipVerification/);
  assert.match(actions, /const selectedPlan = formData\.get\("student_declaration"\) === "on"[\s\S]*defaultMembershipPlan\(eligible\.plans\)/);
  assert.match(actions, /p_plan_id: selectedPlan\.id/);
  assert.match(officerEligibilityFields, /name="date_of_birth"[\s\S]*onInput=/);
  assert.doesNotMatch(eligibilityFields, /name="guardian_name"/);
  assert.match(applicationWizard, /name="guardian_name"[\s\S]*required/);
  assert.match(applicationWizard, /name="guardian_email"[\s\S]*required/);
  assert.match(applicationPage, /MembershipApplicationWizard/);
  assert.match(applicationWizard, /list="membership-title-options"/);
  assert.match(applicationWizard, /<option value="Mx"\/>/);
  assert.match(applicationWizard, /A copy is available on request and in the website’s member area after activation/);
  assert.match(applicationWizard, /membership card and lanyard/);
  assert.match(applicationWizard, /essential membership messages/);
  assert.match(applicationWizard, /I agree to follow the Club Rules/);
  assert.match(membershipCore, /MEMBERSHIP_TERMS_VERSION = "2026-09-17"/);
  assert.match(applicationWizard, /value="bank_transfer"/);
  assert.match(applicationWizard, /value="cheque"/);
  assert.match(guardianPage, /I confirm my consent/);
  assert.match(settingsPage, /tab: "payment"/);
  assert.match(settingsPage, /\/admin\/memberships\/setup/);
  assert.doesNotMatch(applicationWizard, /bank_account_number/);
});

test("fees, billing years and ages follow the London date, as the database does, in the hour after midnight in summer", () => {
  // 23:30 UTC on 31 May is 00:30 on 1 June in London, so June's fee applies.
  const justAfterMidnightInLondon = new Date("2027-05-31T23:30:00Z");
  assert.equal(proratedMembershipFee(1200, justAfterMidnightInLondon), 700);
  assert.equal(proratedMembershipFee(1200, new Date("2027-05-31T22:30:00Z")), 800);
  // In winter London and UTC are the same, so the year boundary is unchanged.
  assert.equal(membershipBillingYear(new Date("2027-11-30T23:30:00Z")), 2027);
  assert.equal(membershipBillingYear(new Date("2027-12-01T00:30:00Z")), 2028);
  assert.equal(ageOn("2000-07-01", new Date("2027-06-30T23:30:00Z")), 27);
  assert.equal(ageOn("2000-07-01", new Date("2027-06-30T22:30:00Z")), 26);
});
