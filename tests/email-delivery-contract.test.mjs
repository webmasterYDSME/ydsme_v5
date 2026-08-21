import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("routes local application and membership mail to Mailpit without weakening hosted delivery", async () => {
  const [applicationDelivery, membershipDelivery, config, example, bootstrap, migration, packageJson] = await Promise.all([
    read("lib/email-delivery.ts"),
    read("supabase/functions/deliver-membership-notifications/index.ts"),
    read("supabase/config.toml"),
    read(".env.example"),
    read("scripts/configure-local-supabase.mjs"),
    read("supabase/migrations/202608210002_immediate_membership_notification_delivery.sql"),
    read("package.json"),
  ]);

  assert.match(applicationDelivery, /NEXT_PUBLIC_SITE_URL/);
  assert.match(applicationDelivery, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(applicationDelivery, /LOCAL_MAILPIT_URL/);
  assert.match(applicationDelivery, /\/api\/v1\/send/);
  assert.match(applicationDelivery, /https:\/\/api\.resend\.com\/emails/);
  assert.match(applicationDelivery, /if \(usesLocalMailpit\(\)\)/);

  assert.match(membershipDelivery, /loopbackSiteUrl\(siteUrl\)/);
  assert.match(membershipDelivery, /localSupabaseUrl\(supabaseUrl\)/);
  assert.match(membershipDelivery, /localMailpitUrl\(mailpitUrl\)/);
  assert.match(membershipDelivery, /https:\/\/api\.resend\.com\/emails/);
  assert.match(membershipDelivery, /Idempotency-Key/);

  assert.match(config, /LOCAL_MAILPIT_URL = "http:\/\/inbucket:8025"/);
  assert.match(example, /LOCAL_MAILPIT_URL=http:\/\/127\.0\.0\.1:55324/);
  assert.match(bootstrap, /local\.API_URL,[\s\S]*http:\/\/127\.0\.0\.1:55321/);
  assert.match(bootstrap, /local\.SECRET_KEY/);
  assert.match(bootstrap, /maintenance_secret_key/);
  assert.match(bootstrap, /http:\/\/kong:8000/);
  assert.match(packageJson, /supabase start && node scripts\/configure-local-supabase\.mjs/);
  assert.match(migration, /after insert on public\.membership_notifications/);
  assert.match(migration, /perform public\.request_membership_notification_delivery\(\)/);
  assert.match(migration, /'\* \* \* \* \*'/);
});

test("keeps signup mail actionable and combines activation with account setup", async () => {
  const [verification, membership, invitation, worker, activationHold] = await Promise.all([
    read("app/membership/verify/route.ts"),
    read("lib/membership.ts"),
    read("supabase/templates/invite.html"),
    read("supabase/functions/deliver-membership-notifications/index.ts"),
    read("supabase/migrations/202608210003_hold_activation_email_for_portal_link.sql"),
  ]);

  assert.match(verification, /membership\.application-payment-reminder/);
  assert.match(verification, /Finish \$\{application\.full_name\}'s membership payment/);
  assert.match(verification, /\$\{application\.full_name\}'s membership application is ready for payment/);
  assert.match(verification, /scheduled_for: new Date\(Date\.now\(\) \+ 2 \* 60 \* 60 \* 1000\)/);
  assert.doesNotMatch(verification, /membership\.application-approval-required/);
  assert.match(membership, /membership_active: true/);
  assert.match(membership, /auth\/invite\?next=\/account/);
  assert.match(membership, /eq\("kind", "membership\.activated"\)[\s\S]*email_status/);
  assert.match(invitation, /if \.Data\.membership_active/);
  assert.match(invitation, /Your Society membership is active/);
  assert.match(invitation, /No password is needed; future sign-ins use a one-time link/);
  assert.match(invitation, /Open your account/);
  assert.match(worker, /providerMessageId/);
  assert.match(worker, /complete_membership_notification/);
  assert.match(activationHold, /new\.email_status := 'cancelled'/);
  assert.match(activationHold, /lower\(new\.recipient_email\) = v_contact_email/);
  assert.match(membership, /linkPortalNotices\(member\.auth_user_id, true\)/);
  assert.match(membership, /linkPortalNotices\(data\.user\.id, false\)/);
  assert.match(membership, /An email match is only a correspondence signal/);
  assert.match(membership, /portal_invitation_status: "blocked_shared"/);
  assert.match(membership, /releaseActivationEmail\(authUserId, "\/auth\/switch-account\?next=\/account"\)/);
  assert.match(membership, /request_membership_notification_delivery/);
});

test("names the relevant applicant in shared-mailbox decision messages", async () => {
  const [verification, actions] = await Promise.all([
    read("app/membership/verify/route.ts"),
    read("lib/actions/membership.ts"),
  ]);

  assert.match(verification, /Confirm \$\{application\.full_name\}'s Junior membership application/);
  assert.match(actions, /\$\{application\.full_name\}'s membership application is approved/);
  assert.match(actions, /\$\{application\.full_name\}'s membership application update/);
  assert.doesNotMatch(actions, /title: "Your membership application is approved"/);
});

test("uses Society language for member-facing payment updates", async () => {
  const [application, account, actions, webhook, paymentLanguage] = await Promise.all([
    read("app/membership/apply/page.tsx"),
    read("app/account/page.tsx"),
    read("lib/actions/membership.ts"),
    read("app/api/stripe/webhook/route.ts"),
    read("supabase/migrations/202608200035_member_facing_payment_language.sql"),
  ]);

  assert.match(application, /We’re still verifying your payment/);
  assert.doesNotMatch(application, /Stripe is processing your payment/);
  assert.match(account, /membership securely online/);
  assert.match(account, /Continue to payment/);
  assert.doesNotMatch(account, /Opening Stripe|Continue to Stripe|securely with Stripe/);
  assert.match(actions, /Continue to secure online payment to activate membership/);
  assert.match(webhook, /We could not verify \$\{memberName\}'s full payment/);
  assert.match(webhook, /\$\{member\.full_name\}'s annual membership payment[^`]+has been confirmed/);
  assert.match(paymentLanguage, /replacement online or offline payment/);
  assert.match(paymentLanguage, /complete online or offline renewal/);
});
