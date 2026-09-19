import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isUnappliedPayment, membershipRefusalCode, unappliedPaymentReason } from "../lib/membership-admin/unapplied-payment.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a refusal from the database is told apart from a temporary fault", () => {
  assert.equal(membershipRefusalCode("membership_renewal_already_paid"), "membership_renewal_already_paid");
  assert.equal(membershipRefusalCode("P0001: membership_payment_amount_invalid"), "membership_payment_amount_invalid");
  assert.equal(membershipRefusalCode("fetch failed"), null);
  assert.equal(membershipRefusalCode("canceling statement due to statement timeout"), null);
  assert.equal(membershipRefusalCode(undefined), null);
  // The payment-time check depends on the clock, so a later retry can succeed.
  assert.equal(membershipRefusalCode("membership_checkout_payment_time_invalid"), null);
});

test("an unapplied card payment gets a plain reason and is recognised by its marker", () => {
  assert.equal(isUnappliedPayment("unapplied:membership_renewal_already_paid"), true);
  assert.equal(isUnappliedPayment("The payment could not be verified."), false);
  assert.equal(isUnappliedPayment(null), false);
  assert.match(unappliedPaymentReason("unapplied:membership_renewal_already_paid"), /already paid another way/);
  assert.match(unappliedPaymentReason("unapplied:membership_payment_amount_invalid"), /fee changed/);
  assert.match(unappliedPaymentReason("unapplied:something_new"), /could not be updated automatically/);
});

test("the payment webhook records a refused card payment for an officer instead of failing and being resent", () => {
  const webhook = read("app/api/stripe/webhook/route.ts");
  assert.match(webhook, /membershipRefusalCode\(error\.message\)/);
  assert.match(webhook, /rpc\("record_unapplied_membership_payment"/);
  // A temporary fault still throws so Stripe retries.
  assert.match(webhook, /if \(!refusal\) throw new Error/);
  // A delivery that already recorded the payment is not applied a second time.
  assert.match(webhook, /recordedMemberIdForSession\(session\.id\)/);
});

test("recording an offline payment closes any card payment page the member left open", () => {
  const actions = read("lib/actions/membership.ts");
  assert.match(actions, /closeOpenMembershipCheckouts\(\{ applicationId \}\)/);
  assert.match(actions, /closeOpenMembershipCheckouts\(\{ memberId, membershipYear: year \}\)/);
  const membership = read("lib/membership.ts");
  assert.match(membership, /checkout\.sessions\.expire/);
  // A payment that has already gone through is never expired.
  assert.match(membership, /session\.status === "complete"\) continue/);
});

test("an unapplied card payment can be cleared by an officer and then leaves Problems", () => {
  const actions = read("lib/actions/membership.ts");
  assert.match(actions, /export async function resolveUnappliedMembershipPayment/);
  const inbox = read("lib/membership-admin/inbox.ts");
  assert.match(inbox, /\.is\("resolved_at", null\)\.limit\(LIMIT\.checkoutAttempts\)/);
  const migration = read("supabase/migrations/202609190011_membership_unapplied_payments.sql");
  assert.match(migration, /add column if not exists resolved_at/);
  assert.match(migration, /revoke all on function public\.record_unapplied_membership_payment/);
});

test("only payments that hold money are owed back after a denied membership", () => {
  const inbox = read("lib/membership-admin/inbox.ts");
  assert.match(inbox, /\["paid", "partially_refunded"\]\.includes\(payment\.status\)/);
  const migration = read("supabase/migrations/202609190012_membership_money_and_expiry_fixes.sql");
  assert.match(migration, /p\.status in \('paid','partially_refunded'\)/);
});

test("an application with a cheque already received is not expired", () => {
  const migration = read("supabase/migrations/202609190012_membership_money_and_expiry_fixes.sql");
  assert.match(migration, /offline\.application_id=application\.id and offline\.status='received'/);
});

test("website access follows the membership record and never reopens or locks out the wrong people", () => {
  const migration = read("supabase/migrations/202609190013_membership_access_follows_membership.sql");
  // Moving or removing a login suspends it only when nothing else keeps it a member, officer or committee listing.
  assert.match(migration, /old\.auth_user_id is distinct from new\.auth_user_id/);
  assert.match(migration, /ur\.role <> 'member'/);
  assert.match(migration, /public\.committees cm/);
  // Only active and lapsed accounts move; suspended and archived ones are never reopened.
  assert.match(migration, /membership_status in \('active', 'lapsed'\)/);
  assert.doesNotMatch(migration, /membership_status = 'archived'/);
  // Administrators are not exempt: a later migration removes the exemption the first version had.
  const noExemption = read("supabase/migrations/202609190016_membership_access_no_administrator_exemption.sql");
  assert.doesNotMatch(noExemption, /administrator'\)/);
  assert.match(noExemption, /membership_status in \('active', 'lapsed'\)/);
  const config = read("supabase/config.toml");
  assert.doesNotMatch(config, /^enable_signup = true/m);
});

test("the daily membership job catches up on days it missed and tells officers when it has stopped", () => {
  const migration = read("supabase/migrations/202609190014_membership_daily_catch_up.sql");
  assert.match(migration, /create table if not exists public\.membership_daily_runs/);
  assert.match(migration, /p_today - 60/);
  assert.match(migration, /public\.run_membership_daily\(v_day\)/);
  assert.match(read("supabase/functions/run-membership-automation/index.ts"), /rpc\("run_membership_daily_catch_up"/);
  assert.match(read("lib/membership-admin/inbox.ts"), /Daily membership updates have stopped/);
});

test("email addresses are matched as exact text, never as patterns", () => {
  for (const path of ["lib/membership.ts", "lib/actions/membership.ts"]) {
    const source = read(path);
    for (const match of source.matchAll(/\.ilike\(\s*"(?:contact_email|recipient_email|email)",\s*([^)]*)\)/g)) {
      assert.match(match[1], /likeLiteral|postgrestLikeLiteral|escapedEmail/, `${path}: ${match[0]}`);
    }
  }
  assert.match(read("supabase/functions/run-membership-automation/index.ts"), /replaceAll\("_", "\\\\_"\)/);
});

test("unsubscribing from the newsletter never re-enables email that was blocked for bouncing or complaints", () => {
  const source = read("lib/actions/membership.ts");
  const start = source.indexOf("export async function unsubscribeMembershipNewsletter");
  const body = source.slice(start, source.indexOf("export async function", start + 10));
  // An existing row only has its newsletter flag changed; only a brand-new row is inserted with the other flag off.
  assert.match(body, /\.update\(\{ newsletter_suppressed: true, updated_at/);
  assert.doesNotMatch(body, /upsert\(/);
});

test("officer review notices that used to be invisible now appear in the Inbox and can be cleared", () => {
  const { MEMBER_REVIEW_KINDS } = { MEMBER_REVIEW_KINDS: read("lib/membership-admin/review-notices.ts") };
  assert.match(MEMBER_REVIEW_KINDS, /membership\.possible-duplicate-officer/);
  assert.match(MEMBER_REVIEW_KINDS, /membership\.junior-adult-officer/);
  assert.match(read("lib/membership-admin/inbox.ts"), /type: "member-review"/);
  assert.match(read("lib/actions/membership.ts"), /export async function completeMembershipReviewNotice/);
});

test("a Junior's guardian is copied on the renewal invitation and reminder", () => {
  const migration = read("supabase/migrations/202609190015_membership_guardian_copy_renewal_requests.sql");
  assert.match(migration, /'membership\.renewal-invitation','membership\.renewal-reminder'/);
});

test("a second card payment for someone already active can be cleared, with the refund steps shown", () => {
  const inbox = read("lib/membership-admin/inbox.ts");
  assert.match(inbox, /attempt\.status === "payment_review" && !isUnappliedPayment\(attempt\.last_error\)/);
  assert.match(inbox, /DUPLICATE_PAYMENT_REASON/);
  const panel = read("app/admin/memberships/_components/InboxTaskPanel.tsx");
  assert.match(panel, /Refund the second payment in Stripe, then mark this as dealt with/);
  assert.match(panel, /Open the payment in Stripe/);
});

test("members under 18 cannot be given a login of their own", () => {
  const actions = read("lib/actions/membership.ts");
  const start = actions.indexOf("export async function assignMemberPortalLogin");
  const body = actions.slice(start, actions.indexOf("export async function removeMemberPortalLogin"));
  assert.match(body, /ageOn\(member\.date_of_birth\) < 18\) redirect\(`\$\{record\}&error=portal-login-junior`\)/);
  assert.match(read("lib/membership-admin/messages.ts"), /"portal-login-junior"/);
});
