import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseEnvironment } from "../tests/local-supabase.mjs";

const local = readLocalSupabaseEnvironment("Membership visual matrix");
const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "The visual matrix may run only against a local website.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, local.API_URL, "The visual matrix may write only to the local Supabase stack.");
const stripeKey = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
assert.match(stripeKey || "", /^(?:rk|sk)_test_/, "Stripe test-mode credentials are required.");

const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY);
const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const outputDirectory = `/tmp/membership-visual-matrix-${runId}`;
await mkdir(outputDirectory, { recursive: true });

const journeys = [
  ["adult", "online-success"], ["adult", "online-failed"], ["adult", "cheque"], ["adult", "cash"], ["adult", "bank-transfer"],
  ["student", "online-success"], ["student", "cheque"], ["student", "cash"], ["student", "bank-transfer"],
  ["concession", "online-success"], ["concession", "cheque"], ["concession", "cash"], ["concession", "bank-transfer"],
  ["junior", "online-success"], ["junior", "cheque"], ["junior", "cash"], ["junior", "bank-transfer"],
].map(([plan, method], index) => ({
  index: index + 1,
  plan,
  method,
  slug: `${String(index + 1).padStart(2, "0")}-${plan}-${method}`,
  name: `Visual Journey ${String(index + 1).padStart(2, "0")} ${plan.replace(/^./, value => value.toUpperCase())} ${method.replaceAll("-", " ")}`,
  email: `visual.membership.${runId}.${String(index + 1).padStart(2, "0")}@example.test`,
}));

const dobFor = {
  adult: "02/04/1980",
  student: "01/01/2006",
  concession: "01/01/1940",
  junior: "01/01/2011",
};
const methodValue = {
  "online-success": "stripe",
  "online-failed": "stripe",
  cheque: "cheque",
  cash: "cash",
  "bank-transfer": "bank_transfer",
};
const expectedOutcome = {
  cheque: "awaiting-cheque",
  cash: "awaiting-cash",
  "bank-transfer": "awaiting-bank-transfer",
};

async function mailpitMessages() {
  const response = await fetch("http://127.0.0.1:55324/api/v1/messages");
  assert.equal(response.ok, true, "Mailpit is unavailable.");
  return (await response.json()).messages ?? [];
}

async function messageBody(id) {
  const response = await fetch(`http://127.0.0.1:55324/api/v1/message/${id}`);
  assert.equal(response.ok, true, "Unable to read a Mailpit message.");
  return response.json();
}

async function waitForMail(email, predicate, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    for (const summary of await mailpitMessages()) {
      if (!summary.To?.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase())) continue;
      const message = await messageBody(summary.ID);
      if (predicate(message)) return message;
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error(`Expected email did not arrive for ${email}.`);
}

async function verificationCode(email) {
  const message = await waitForMail(email, candidate => /code is\s+(\d{6})/i.test(candidate.Text || ""));
  return message.Text.match(/code is\s+(\d{6})/i)?.[1];
}

async function configureLocalPaymentInstructions() {
  const { data: active, error: readError } = await admin.from("membership_payment_settings_versions")
    .select("id").eq("active", true).single();
  assert.equal(readError, null, "Unable to load local membership payment settings.");
  const { error: updateError } = await admin.from("membership_payment_settings_versions").update({
    configured: true,
    treasurer_name: "Local Membership Test Officer",
    treasurer_email: "membership.local@example.test",
    bank_account_name: "Local Society Test Account",
    bank_sort_code: "00-11-22",
    bank_account_number: "12345678",
    bank_transfer_instructions: "Use the membership reference shown. This is a local test account and no money should be sent.",
    cheque_payee: "Local Society Test Account",
    cheque_delivery_instructions: "Give the test cheque to the local test Treasurer. Do not send real money.",
    cash_instructions: "Give the test cash payment to the local test Treasurer. Do not exchange real money.",
  }).eq("id", active.id);
  assert.equal(updateError, null, "Unable to configure local membership payment instructions.");
}

async function screenshot(page, journey, label, mobile = false) {
  await page.screenshot({
    path: `${outputDirectory}/${journey.slug}-${label}${mobile ? "-mobile" : ""}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${journey.slug} ${label} has ${overflow}px horizontal overflow.`);
}

async function waitForCaptcha(page) {
  await page.waitForFunction(() => {
    const field = document.querySelector('input[name="captchaToken"]');
    return field instanceof HTMLInputElement && field.value.length > 10;
  }, null, { timeout: 15_000 });
}

async function fillContactDetails(page, journey) {
  if (journey.plan === "junior") {
    await page.locator('[name="full_name"]').fill(journey.name);
    await page.locator('[name="guardian_name"]').fill(`Guardian for ${journey.name}`);
    await page.locator('[name="guardian_email"]').fill(journey.email);
    await page.locator('[name="guardian_consent"]').check();
  } else {
    await page.locator('[name="full_name"]').fill(journey.name);
    await page.locator('[name="contact_email"]').fill(journey.email);
    await page.locator('[name="contact_number"]').fill("01904 555 017");
  }
}

async function captureFreshMobileDetails(page, journey) {
  const mobilePage = await page.context().newPage();
  try {
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.goto(new URL("/membership/apply", baseUrl).href);
    await mobilePage.locator('[name="date_of_birth"]').fill(dobFor[journey.plan]);
    if (journey.plan === "student") await mobilePage.getByRole("radio", { name: /Student/ }).check();
    await mobilePage.getByRole("button", { name: "Continue", exact: true }).click();
    await fillContactDetails(mobilePage, journey);
    await waitForCaptcha(mobilePage);
    await screenshot(mobilePage, journey, "02-details", true);
  } finally {
    await mobilePage.close();
  }
}

async function createApplication(page, journey) {
  await page.goto(new URL("/membership/apply", baseUrl).href);
  await page.locator('[name="date_of_birth"]').fill(dobFor[journey.plan]);
  if (journey.plan === "student") await page.getByRole("radio", { name: /Student/ }).check();
  await screenshot(page, journey, "01-membership");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await fillContactDetails(page, journey);
  await waitForCaptcha(page);
  await screenshot(page, journey, "02-details");
  await captureFreshMobileDetails(page, journey);

  await page.getByRole("button", { name: "Get code", exact: true }).click();
  await page.getByText(/Code sent/).waitFor();
  const code = await verificationCode(journey.email);
  assert.match(code || "", /^\d{6}$/);
  await page.getByLabel("Six-digit verification code").fill(code);
  await screenshot(page, journey, "03-code");
  const alignment = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(candidate => candidate.textContent?.trim() === "Get code");
    const codeInput = document.querySelector(".membership-code-input");
    if (!(button instanceof HTMLElement) || !(codeInput instanceof HTMLElement)) return null;
    return Math.abs(button.getBoundingClientRect().top - codeInput.getBoundingClientRect().top);
  });
  assert.ok(alignment !== null && alignment <= 3, `${journey.slug} code controls are misaligned by ${alignment}px.`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Check and confirm." }).waitFor();
  await page.locator('[name="terms"]').check();
  await screenshot(page, journey, "04-review");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator(`[name="payment_method"][value="${methodValue[journey.method]}"]`).check();
  await screenshot(page, journey, "05-payment");
  await page.getByRole("button", { name: "Submit application" }).click();
}

async function fillStripeCheckout(page, cardNumber) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.locator("#payment-method-accordion-item-title-card").check({ force: true });
  await page.locator("#cardNumber").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#cardNumber").fill(cardNumber);
  await page.locator("#cardExpiry").fill("1234");
  await page.locator("#cardCvc").fill("123");
  const billingName = page.locator("#billingName");
  if (await billingName.isVisible().catch(() => false)) await billingName.fill("Visual Membership Test");
  const postalCode = page.locator("#billingPostalCode");
  if (await postalCode.isVisible().catch(() => false)) await postalCode.fill("YO1 7HH");
}

async function checkoutSessionFor(email) {
  const { data: application, error: applicationError } = await admin.from("membership_applications")
    .select("id,status,converted_member_id").eq("contact_email", email).single();
  assert.equal(applicationError, null);
  const { data: attempt, error: attemptError } = await admin.from("membership_checkout_attempts")
    .select("stripe_checkout_session_id,status").eq("application_id", application.id).order("created_at", { ascending: false }).limit(1).single();
  assert.equal(attemptError, null);
  return { application, attempt };
}

async function finishOnline(page, journey) {
  await page.waitForURL(/\/membership\/checkout\?token=/);
  await screenshot(page, journey, "06-checkout-review");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await fillStripeCheckout(page, journey.method === "online-failed" ? "4000000000000002" : "4242424242424242");
  await screenshot(page, journey, "07-stripe");
  await page.locator('button[type="submit"]').last().click();

  if (journey.method === "online-failed") {
    await page.getByText(/declined|cannot be processed|was not successful/i).first().waitFor({ timeout: 20_000 });
    await screenshot(page, journey, "08-declined");
    const { attempt } = await checkoutSessionFor(journey.email);
    assert.ok(attempt.stripe_checkout_session_id);
    await stripe.checkout.sessions.expire(attempt.stripe_checkout_session_id);
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      const { data } = await admin.from("membership_notifications").select("id")
        .eq("kind", "membership.checkout-expired").eq("recipient_email", journey.email).maybeSingle();
      if (data) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    await waitForMail(journey.email, message => /payment was not completed/i.test(`${message.Subject} ${message.Text}`));
    await page.goto(new URL("/membership/apply?application=payment-cancelled", baseUrl).href);
    await screenshot(page, journey, "09-outcome");
    return;
  }

  await page.waitForURL(new RegExp(`${baseUrl.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/membership/apply\\?application=payment-received`), { timeout: 40_000 });
  await screenshot(page, journey, "08-outcome");
  const started = Date.now();
  let application;
  while (Date.now() - started < 30_000) {
    const result = await admin.from("membership_applications").select("status,converted_member_id").eq("contact_email", journey.email).single();
    application = result.data;
    if (application?.status === "converted" && application.converted_member_id) break;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  assert.equal(application?.status, "converted", `${journey.slug} was not activated by the verified Stripe webhook.`);
  await waitForMail(journey.email, message => !/verification code/i.test(`${message.Subject} ${message.Text}`), 30_000);
}

async function finishOffline(page, journey) {
  await page.waitForURL(new RegExp(`application=${expectedOutcome[journey.method]}`));
  if (["bank-transfer", "cash", "cheque"].includes(journey.method)) {
    await page.getByRole("heading", { name: "Thank you for applying for Society membership." }).waitFor();
    await page.getByRole("heading", { name: journey.method === "bank-transfer" ? "Bank transfer details" : journey.method === "cheque" ? "Cheque payment details" : "Cash payment details" }).waitFor();
    await page.getByText(journey.name, { exact: true }).waitFor();
    if (journey.method !== "cash") await page.getByText("Local Society Test Account", { exact: true }).waitFor();
  }
  await screenshot(page, journey, "06-outcome");
  const expectedStatus = `awaiting_${methodValue[journey.method]}`;
  const { data, error } = await admin.from("membership_applications").select("status,manual_verification,guardian_led")
    .eq("contact_email", journey.email).single();
  assert.equal(error, null);
  assert.equal(data.status, expectedStatus);
  assert.equal(data.guardian_led, journey.plan === "junior");
  assert.equal(data.manual_verification, journey.plan === "adult" ? "not_required" : "pending");
  const paymentEmail = await waitForMail(journey.email, message => /payment|bank transfer/i.test(`${message.Subject} ${message.Text}`));
  if (["bank-transfer", "cash", "cheque"].includes(journey.method)) {
    assert.match(paymentEmail.Text || "", /Amount:\s*£\d/);
    assert.doesNotMatch(paymentEmail.Text || "", /MEM-[A-Z0-9]+/);
    if (journey.method === "bank-transfer") {
      assert.match(paymentEmail.Text || "", new RegExp(`Reference:\\s*${journey.name}`));
      assert.match(paymentEmail.Text || "", /Account name:\s*Local Society Test Account/);
    } else if (journey.method === "cheque") {
      assert.match(paymentEmail.Text || "", new RegExp(`Applicant’s full name to write on the back of the cheque:\\s*${journey.name}`));
      assert.match(paymentEmail.Text || "", /Payable to:\s*Local Society Test Account/);
    } else {
      assert.match(paymentEmail.Text || "", new RegExp(`Member name:\\s*${journey.name}`));
    }
  }
}

const rateLimitScopes = ["membership-application", "signup-code-email", "signup-code-ip", "signup-code-cooldown", "signup-code-verify", "signup-code-global"];
await configureLocalPaymentInstructions();
await admin.from("rate_limits").delete().in("scope", rateLimitScopes);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const results = [];
try {
  for (const journey of journeys) {
    await context.clearCookies();
    const page = await context.newPage();
    try {
      await createApplication(page, journey);
      if (journey.method.startsWith("online")) await finishOnline(page, journey);
      else await finishOffline(page, journey);
      results.push({ ...journey, result: "passed" });
      process.stdout.write(`✓ ${journey.slug}\n`);
    } catch (error) {
      await page.screenshot({ path: `${outputDirectory}/${journey.slug}-failure.png`, fullPage: true }).catch(() => {});
      results.push({ ...journey, result: "failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ outputDirectory, runId, results }, null, 2));
