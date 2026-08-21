import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

const siteUrl = process.env.STRIPE_JOURNEY_SITE_URL || "http://127.0.0.1:3010";
const fixtureEmail = "journey.membership.stripe@example.test";
const fixtureExpiredEmail = "journey.membership.stripe-expired@example.test";
const fixtureStudentEmail = "journey.membership.stripe-student@example.test";
const fixtureJuniorEmail = "journey.membership.stripe-junior@example.test";
const fixtureJuniorGuardianEmail = "journey.membership.stripe-junior-guardian@example.test";
const fixtureConcessionEmail = "journey.membership.stripe-concession@example.test";
const fixtureOfficerEmail = "journey.membership.stripe-officer@example.test";
const fixtureEmails = [
  fixtureEmail,
  fixtureExpiredEmail,
  fixtureStudentEmail,
  fixtureJuniorEmail,
  fixtureJuniorGuardianEmail,
  fixtureConcessionEmail,
  fixtureOfficerEmail,
];
const stripeKey = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
assert.match(stripeKey || "", /^(?:sk|rk)_test_/, "Stripe membership journeys require a test-mode key.");
assert.match(webhookSecret || "", /^whsec_/, "Stripe membership journeys require a local webhook signing secret.");

const local = readLocalSupabaseEnvironment("Stripe membership journey");
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(projectId);

let product;
let recurringPrice;
let customer;
let subscription;
let originalProductId = null;
let originalPriceId = null;
let originalNextPriceId = null;
let planId;
let planPriceId;
let nextPlanPriceId;
const additionalPlanResources = [];

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function dateOfBirthForAge(age) {
  return `${new Date().getUTCFullYear() - age}-06-15`;
}

function localCleanup() {
  const emails = fixtureEmails.map((email) => `'${email}'`).join(",");
  const sql = String.raw`
begin;
delete from public.membership_notifications where application_id in (
  select id from public.membership_applications where contact_email in (${emails})
) or member_id in (select id from public.members where contact_email in (${emails}));
delete from public.membership_provider_commands where member_id in (
  select id from public.members where contact_email in (${emails})
);
delete from public.membership_checkout_attempts where application_id in (
  select id from public.membership_applications where contact_email in (${emails})
) or member_id in (select id from public.members where contact_email in (${emails}));
delete from public.membership_payments where term_id in (
  select id from public.membership_terms where member_id in (
    select id from public.members where contact_email in (${emails})
  )
);
delete from public.membership_terms where member_id in (
  select id from public.members where contact_email in (${emails})
);
delete from public.membership_subscriptions where member_id in (
  select id from public.members where contact_email in (${emails})
);
delete from public.honorary_memberships where member_id in (
  select id from public.members where contact_email in (${emails})
);
delete from public.members where contact_email in (${emails});
delete from public.membership_applications where contact_email in (${emails});
delete from auth.users where email in (${emails});
delete from public.stripe_webhook_events where stripe_event_id like 'evt_test_membership_%';
commit;`;
  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
  );
  assert.equal(result.status, 0, "Unable to clean local Stripe membership fixtures.");
}

async function row(query, message) {
  const { data, error } = await query;
  assert.equal(error, null, `${message}: ${error?.message || "unknown error"}`);
  assert.ok(data, message);
  return data;
}

async function waitFor(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(message);
}

async function createApplication(email, token, options = {}) {
  return row(
    admin.from("membership_applications").insert({
      requested_plan_id: options.planId ?? planId,
      full_name: options.fullName
        ?? (email === fixtureEmail ? "Journey Membership Stripe Paid" : "Journey Membership Stripe Expired"),
      contact_email: email,
      contact_role: "self",
      date_of_birth: options.dateOfBirth ?? "1980-04-02",
      payment_method: "stripe",
      auto_renew: false,
      status: "awaiting_payment",
      email_verified_at: new Date().toISOString(),
      student_declaration: options.studentDeclaration ?? false,
      guardian_name: options.guardianName ?? null,
      guardian_email: options.guardianEmail ?? null,
      guardian_consent: options.guardianConsent ?? false,
      guardian_verified_at: options.guardianVerifiedAt ?? null,
      verification_token_hash: tokenHash(token),
      verification_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      terms_version: "2026-08-21",
      terms_accepted_at: new Date().toISOString(),
    }).select("id,created_at").single(),
    `Unable to create ${email} application`,
  );
}

async function configureAdditionalPlan(slug, billingYear) {
  const plan = await row(
    admin.from("membership_plans").select("id,name,stripe_product_id").eq("slug", slug).single(),
    `${slug} membership plan is unavailable`,
  );
  const currentPrice = await row(
    admin.from("membership_plan_prices").select("id,amount_pence,stripe_price_id")
      .eq("plan_id", plan.id).eq("membership_year", billingYear).eq("active", true).single(),
    `${slug} membership price is unavailable`,
  );
  const product = await stripe.products.create({
    name: `YCDSME ${slug} membership journey ${Date.now()}`,
    metadata: { ydsme_integration: "memberships", purpose: "automated_test", membership_plan: slug },
  });
  const recurringPrice = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: currentPrice.amount_pence,
    recurring: { interval: "year" },
    metadata: { ydsme_integration: "memberships", purpose: "automated_test", membership_plan: slug },
  });
  const ensuredNext = await admin.rpc("ensure_membership_plan_price", {
    p_plan_id: plan.id,
    p_membership_year: billingYear + 1,
  });
  assert.equal(ensuredNext.error, null, `The ${slug} next annual fee could not be carried forward.`);
  const nextPriceId = ensuredNext.data?.[0]?.id;
  assert.ok(nextPriceId, `The ${slug} next annual fee snapshot is missing.`);
  const originalNextPriceId = ensuredNext.data?.[0]?.stripe_price_id ?? null;
  assert.equal((await admin.from("membership_plans").update({ stripe_product_id: product.id }).eq("id", plan.id)).error, null);
  assert.equal((await admin.from("membership_plan_prices").update({ stripe_price_id: recurringPrice.id })
    .in("id", [currentPrice.id, nextPriceId])).error, null);
  const resource = {
    slug,
    plan,
    currentPrice,
    nextPriceId,
    originalNextPriceId,
    product,
    recurringPrice,
  };
  additionalPlanResources.push(resource);
  return resource;
}

async function sendSignedEvent(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const response = await fetch(`${siteUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  const body = await response.json();
  assert.equal(response.status, 200, `Signed ${event.type} webhook failed: ${JSON.stringify(body)}`);
  return body;
}

function stripeEvent(type, object, created = Math.floor(Date.now() / 1000)) {
  return {
    id: `evt_test_membership_${randomUUID().replaceAll("-", "")}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

async function openApplicationCheckout(token, applicationId) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${siteUrl}/membership/checkout?token=${encodeURIComponent(token)}`);
    await page.getByRole("heading", { name: "Review your payment" }).waitFor();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });
  } finally {
    await browser.close();
  }
  return waitFor(async () => {
    const sessions = await stripe.checkout.sessions.list({ limit: 30 });
    return sessions.data.find((session) => session.client_reference_id === applicationId && session.status === "open") || null;
  }, "The website did not create the expected subscription Checkout Session.");
}

localCleanup();
try {
  const health = await fetch(`${siteUrl}/membership/apply`, { redirect: "manual" });
  assert.equal(health.status, 200, `The membership website is not enabled at ${siteUrl}.`);
  const badSignature = await fetch(`${siteUrl}/api/stripe/webhook`, {
    method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}",
  });
  assert.equal(badSignature.status, 400, "An invalid Stripe signature was accepted.");
  const { data: officerAccount, error: officerError } = await admin.auth.admin.createUser({
    email: fixtureOfficerEmail,
    password: `Journey-${randomUUID()}-Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: "Journey Membership Officer" },
  });
  assert.equal(officerError, null, "The journey membership officer could not be created.");
  assert.ok(officerAccount.user);
  assert.equal((await admin.from("user_roles").update({ role: "administrator" })
    .eq("user_id", officerAccount.user.id)).error, null);

  const plan = await row(
    admin.from("membership_plans").select("id,stripe_product_id").eq("slug", "adult").single(),
    "Adult membership plan is unavailable",
  );
  const now = new Date();
  const billingYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const planPrice = await row(
    admin.from("membership_plan_prices").select("id,amount_pence,stripe_price_id").eq("plan_id", plan.id)
      .eq("membership_year", billingYear).eq("active", true).single(),
    "Adult membership price is unavailable",
  );
  planId = plan.id;
  planPriceId = planPrice.id;
  originalProductId = plan.stripe_product_id;
  originalPriceId = planPrice.stripe_price_id;
  product = await stripe.products.create({
    name: `YCDSME membership journey ${Date.now()}`,
    metadata: { ydsme_integration: "memberships", purpose: "automated_test" },
  });
  recurringPrice = await stripe.prices.create({
    product: product.id, currency: "gbp", unit_amount: planPrice.amount_pence,
    recurring: { interval: "year" },
    metadata: { ydsme_integration: "memberships", purpose: "automated_test" },
  });
  assert.equal((await admin.from("membership_plans").update({ stripe_product_id: product.id }).eq("id", planId)).error, null);
  assert.equal((await admin.from("membership_plan_prices").update({ stripe_price_id: recurringPrice.id }).eq("id", planPriceId)).error, null);
  const ensuredNext = await admin.rpc("ensure_membership_plan_price", { p_plan_id: planId, p_membership_year: billingYear + 1 });
  assert.equal(ensuredNext.error, null, "The next annual fee could not be carried forward.");
  nextPlanPriceId = ensuredNext.data?.[0]?.id;
  originalNextPriceId = ensuredNext.data?.[0]?.stripe_price_id ?? null;
  assert.ok(nextPlanPriceId, "The next annual fee snapshot is missing.");
  assert.equal((await admin.from("membership_plan_prices").update({ stripe_price_id: recurringPrice.id })
    .eq("id", nextPlanPriceId)).error, null);

  const additionalJourneys = [
    {
      slug: "student",
      email: fixtureStudentEmail,
      fullName: "Journey Membership Stripe Student",
      dateOfBirth: dateOfBirthForAge(21),
      studentDeclaration: true,
    },
    {
      slug: "junior",
      email: fixtureJuniorEmail,
      fullName: "Journey Membership Stripe Junior",
      dateOfBirth: dateOfBirthForAge(16),
      guardianName: "Journey Stripe Guardian",
      guardianEmail: fixtureJuniorGuardianEmail,
      guardianConsent: true,
      guardianVerifiedAt: new Date().toISOString(),
    },
    {
      slug: "concession",
      email: fixtureConcessionEmail,
      fullName: "Journey Membership Stripe Concession",
      dateOfBirth: dateOfBirthForAge(82),
    },
  ];
  for (const journey of additionalJourneys) {
    const configured = await configureAdditionalPlan(journey.slug, billingYear);
    const token = `${journey.slug}-${randomUUID()}-${randomUUID()}`;
    const application = await createApplication(journey.email, token, {
      ...journey,
      planId: configured.plan.id,
    });
    const session = await openApplicationCheckout(token, application.id);
    const expectedInitialAmount = new Date(application.created_at).getUTCMonth() === 11
      ? configured.currentPrice.amount_pence
      : Math.round(configured.currentPrice.amount_pence * (12 - new Date(application.created_at).getUTCMonth()) / 12);
    assert.equal(session.mode, "subscription", `${journey.slug} Checkout is not a subscription.`);
    assert.equal(session.amount_total, expectedInitialAmount, `${journey.slug} has the wrong initial charge.`);
    assert.equal(session.metadata.membership_application_id, application.id);
    assert.equal(session.metadata.membership_plan_price_id, configured.currentPrice.id);
    const planLines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    assert.equal(planLines.data.length, 2, `${journey.slug} Checkout does not have exactly two lines.`);
    assert.ok(planLines.data.some((line) => !line.price?.recurring), `${journey.slug} has no one-time initial line.`);
    assert.ok(planLines.data.some((line) => line.price?.id === configured.recurringPrice.id),
      `${journey.slug} has the wrong annual renewal price.`);
    const expired = await stripe.checkout.sessions.expire(session.id);
    await sendSignedEvent(stripeEvent("checkout.session.expired", expired));
    await waitFor(async () => {
      const result = await admin.from("membership_notifications").select("id")
        .eq("application_id", application.id).eq("kind", "membership.checkout-expired").maybeSingle();
      return result.data;
    }, `${journey.slug} Checkout expiry webhook was not processed.`);
  }

  const expiredToken = `expired-${randomUUID()}-${randomUUID()}`;
  const expiredApplication = await createApplication(fixtureExpiredEmail, expiredToken);
  const openSession = await openApplicationCheckout(expiredToken, expiredApplication.id);
  assert.equal(openSession.mode, "subscription");
  assert.match(openSession.custom_text?.submit?.message || "", /covers membership through 31 December/);
  assert.match(openSession.custom_text?.submit?.message || "", /Automatic renewal is off/);
  assert.doesNotMatch(openSession.custom_text?.submit?.message || "", /trial|days free|Stripe/i);
  assert.equal(openSession.metadata.ydsme_integration, "memberships");
  assert.equal(openSession.metadata.membership_application_id, expiredApplication.id);
  assert.ok(openSession.metadata.membership_checkout_attempt_id);
  const lines = await stripe.checkout.sessions.listLineItems(openSession.id, { limit: 10 });
  assert.equal(lines.data.length, 2);
  assert.ok(lines.data.some((line) => !line.price?.recurring), "The prorated initial term is not a one-time line.");
  assert.ok(lines.data.some((line) => line.price?.recurring?.interval === "year"), "The annual renewal line is missing.");
  const expiredSession = await stripe.checkout.sessions.expire(openSession.id);
  await sendSignedEvent(stripeEvent("checkout.session.expired", expiredSession));
  await waitFor(async () => {
    const result = await admin.from("membership_notifications").select("id").eq("application_id", expiredApplication.id)
      .eq("kind", "membership.checkout-expired").maybeSingle();
    return result.data;
  }, "Checkout expiry webhook was not processed");

  const paidToken = `paid-${randomUUID()}-${randomUUID()}`;
  const paidApplication = await createApplication(fixtureEmail, paidToken);
  const createdAt = new Date(paidApplication.created_at);
  const initialAmount = createdAt.getUTCMonth() === 11
    ? planPrice.amount_pence
    : Math.round(planPrice.amount_pence * (12 - createdAt.getUTCMonth()) / 12);
  const paidSession = await openApplicationCheckout(paidToken, paidApplication.id);
  assert.equal(paidSession.amount_total, initialAmount);

  customer = await stripe.customers.create({ email: fixtureEmail, name: "Journey Membership Stripe Paid" });
  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } });
  subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: recurringPrice.id }],
    trial_end: Math.floor(Date.UTC(billingYear + 1, 0, 1) / 1000),
    default_payment_method: paymentMethod.id,
    metadata: {
      purpose: "automated_test_setup",
    },
  });
  await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: subscription.id,
    amount: initialAmount,
    currency: "gbp",
    description: `Membership through 31 December ${billingYear}`,
  });
  const draftInvoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: subscription.id,
    collection_method: "charge_automatically",
    auto_advance: false,
  });
  await stripe.invoices.finalizeInvoice(draftInvoice.id);
  const invoice = await stripe.invoices.pay(draftInvoice.id);
  const invoiceId = invoice.id;
  assert.equal(invoice.status, "paid", "The test subscription invoice was not paid.");
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  const invoicePayment = invoicePayments.data.find((item) => item.is_default) ?? invoicePayments.data[0];
  const paymentIntentId = typeof invoicePayment?.payment.payment_intent === "string"
    ? invoicePayment.payment.payment_intent : invoicePayment?.payment.payment_intent?.id;
  assert.ok(paymentIntentId, "The paid subscription invoice has no payment intent.");
  // Let the locally forwarded setup invoice settle while the subscription is
  // deliberately outside the membership integration. Checkout is the only
  // event that should activate and record this initial term.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  subscription = await stripe.subscriptions.update(subscription.id, { metadata: {
    ydsme_integration: "memberships",
    membership_application_id: paidApplication.id,
    membership_plan_price_id: nextPlanPriceId,
    membership_year: String(billingYear + 1),
    membership_checkout_attempt_id: paidSession.metadata.membership_checkout_attempt_id,
    membership_auto_renew: "false",
  } });

  const completedSession = {
    ...paidSession,
    amount_total: initialAmount,
    currency: "gbp",
    customer: customer.id,
    invoice: invoiceId,
    payment_status: "paid",
    status: "complete",
    subscription: subscription.id,
  };
  const completedEvent = stripeEvent("checkout.session.completed", completedSession);
  const firstDelivery = await sendSignedEvent(completedEvent);
  assert.equal(firstDelivery.received, true);
  const member = await waitFor(async () => {
    const result = await admin.from("members").select("id,effective_state,auth_user_id").eq("contact_email", fixtureEmail).maybeSingle();
    return result.data;
  }, "Verified Checkout did not activate a canonical member");
  assert.equal(member.effective_state, "active");
  assert.ok(member.auth_user_id, "A unique contact address did not receive its individual portal account.");
  const activationNotice = await row(
    admin.from("membership_notifications")
      .select("recipient_user_id,portal_visible,email_status,title,body")
      .eq("member_id", member.id).eq("kind", "membership.activated").single(),
    "Activated membership has no combined portal notice",
  );
  assert.equal(activationNotice.recipient_user_id, member.auth_user_id);
  assert.equal(activationNotice.portal_visible, true);
  assert.match(activationNotice.title, /Journey Membership Stripe Paid/);
  assert.doesNotMatch(activationNotice.body, /invitation separately/i);
  const term = await row(
    admin.from("membership_terms").select("id,status,amount_due_pence,amount_paid_pence").eq("member_id", member.id).single(),
    "Activated membership term is missing",
  );
  assert.deepEqual({ status: term.status, due: term.amount_due_pence, paid: term.amount_paid_pence },
    { status: "paid", due: initialAmount, paid: initialAmount });
  const payment = await row(
    admin.from("membership_payments").select("id,status,amount_pence,stripe_payment_intent_id,stripe_invoice_id").eq("term_id", term.id).single(),
    "Activated membership payment is missing",
  );
  assert.equal(payment.status, "paid");
  assert.equal(payment.amount_pence, initialAmount);
  assert.equal(payment.stripe_invoice_id, invoiceId);
  assert.equal(payment.stripe_payment_intent_id, paymentIntentId);
  const storedSubscription = await row(
    admin.from("membership_subscriptions").select("stripe_subscription_id,status,cancel_at_period_end").eq("member_id", member.id).single(),
    "Membership subscription is missing",
  );
  assert.equal(storedSubscription.cancel_at_period_end, true);
  assert.equal((await stripe.subscriptions.retrieve(storedSubscription.stripe_subscription_id)).cancel_at_period_end, true);

  const replay = await sendSignedEvent(completedEvent);
  assert.deepEqual(replay, { received: true, replay: true });
  const paymentCount = await admin.from("membership_payments").select("id", { count: "exact", head: true }).eq("term_id", term.id);
  assert.equal(paymentCount.count, 1, "Webhook replay duplicated the payment.");

  const currentSubscription = await stripe.subscriptions.retrieve(subscription.id);
  await sendSignedEvent(stripeEvent("customer.subscription.updated", {
    ...currentSubscription, status: "past_due", cancel_at_period_end: false,
  }, completedEvent.created + 100));
  await sendSignedEvent(stripeEvent("customer.subscription.updated", {
    ...currentSubscription, status: "active", cancel_at_period_end: true,
  }, completedEvent.created - 100));
  const afterOutOfOrder = await row(
    admin.from("membership_subscriptions").select("status,cancel_at_period_end").eq("member_id", member.id).single(),
    "Unable to inspect out-of-order subscription state",
  );
  assert.deepEqual(afterOutOfOrder, { status: "past_due", cancel_at_period_end: false });

  const partialAmount = Math.max(1, Math.floor(initialAmount / 2));
  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, amount: partialAmount });
  const refundChargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  assert.ok(refundChargeId);
  const charge = await stripe.charges.retrieve(refundChargeId);
  await sendSignedEvent(stripeEvent("charge.refunded", charge));
  await waitFor(async () => {
    const result = await admin.from("membership_terms").select("status").eq("id", term.id).single();
    return result.data?.status === "payment_review" ? result.data : null;
  }, "A refund leaving the term underpaid did not create a payment review");
  const reviewMember = await row(admin.from("members").select("effective_state").eq("id", member.id).single(), "Member disappeared after refund");
  assert.equal(reviewMember.effective_state, "payment_review");
  const reviewAlerts = await admin.from("membership_notifications").select("id", { count: "exact", head: true })
    .eq("member_id", member.id).eq("kind", "membership.payment-review-officer");
  assert.ok((reviewAlerts.count ?? 0) > 0, "The payment reversal did not alert membership officers.");

  console.log(JSON.stringify({
    checkout: "all-four-plans-subscription-mode-created-and-expired",
    activation: "verified-invoice-webhook",
    replay: "idempotent",
    outOfOrder: "ignored-stale-state",
    refund: "underpayment-sent-to-review",
  }));
} finally {
  if (subscription?.id) {
    try {
      const current = await stripe.subscriptions.retrieve(subscription.id);
      if (current.status !== "canceled") await stripe.subscriptions.cancel(subscription.id);
    } catch {
      // Best-effort cleanup after a failed journey.
    }
  }
  if (customer?.id) {
    try { await stripe.customers.del(customer.id); } catch {
      // Best-effort cleanup after a failed journey.
    }
  }
  if (recurringPrice?.id) {
    try { await stripe.prices.update(recurringPrice.id, { active: false }); } catch {
      // Best-effort cleanup after a failed journey.
    }
  }
  if (product?.id) {
    try { await stripe.products.update(product.id, { active: false }); } catch {
      // Best-effort cleanup after a failed journey.
    }
  }
  for (const resource of additionalPlanResources) {
    await admin.from("membership_plans").update({ stripe_product_id: resource.plan.stripe_product_id })
      .eq("id", resource.plan.id);
    await admin.from("membership_plan_prices").update({ stripe_price_id: resource.currentPrice.stripe_price_id })
      .eq("id", resource.currentPrice.id);
    await admin.from("membership_plan_prices").update({ stripe_price_id: resource.originalNextPriceId })
      .eq("id", resource.nextPriceId);
    try { await stripe.prices.update(resource.recurringPrice.id, { active: false }); } catch {
      // Best-effort cleanup after a failed journey.
    }
    try { await stripe.products.update(resource.product.id, { active: false }); } catch {
      // Best-effort cleanup after a failed journey.
    }
  }
  if (planId) await admin.from("membership_plans").update({ stripe_product_id: originalProductId }).eq("id", planId);
  if (planPriceId) await admin.from("membership_plan_prices").update({ stripe_price_id: originalPriceId }).eq("id", planPriceId);
  if (nextPlanPriceId) await admin.from("membership_plan_prices").update({ stripe_price_id: originalNextPriceId }).eq("id", nextPlanPriceId);
  localCleanup();
}
