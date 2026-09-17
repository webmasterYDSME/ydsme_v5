import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseEnvironment } from "../tests/local-supabase.mjs";

const local = readLocalSupabaseEnvironment("Membership edge reconciliation");
const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "Edge reconciliation requires the local website.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, local.API_URL, "Edge reconciliation may write only to local Supabase.");

const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY);
const runId = Date.now();
const applicantEmail = `manual.edge.${runId}@example.test`;
const applicantName = `Manual Edge ${runId}`;
const officerEmail = "manual.membership.officer@example.test";
const officerPassword = "LocalManualOfficer-2026!";
const outputDirectory = `/tmp/membership-edge-${runId}`;
const results = [];

async function clearSignupLimits() {
  await admin.from("rate_limits").delete().in("scope", [
    "membership-application", "signup-code-email", "signup-code-ip",
    "signup-code-cooldown", "signup-code-verify", "signup-code-global",
  ]);
}

async function messageIds() {
  const response = await fetch("http://127.0.0.1:55324/api/v1/messages");
  assert.equal(response.ok, true, "Mailpit is unavailable.");
  const list = await response.json();
  return new Set((list.messages ?? []).map(message => message.ID));
}

async function waitForNewCode(email, previousIds) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await (await fetch("http://127.0.0.1:55324/api/v1/messages")).json();
    for (const summary of list.messages ?? []) {
      if (previousIds.has(summary.ID) || !summary.To?.some(recipient => recipient.Address.toLowerCase() === email.toLowerCase())) continue;
      const message = await (await fetch(`http://127.0.0.1:55324/api/v1/message/${summary.ID}`)).json();
      const match = message.Text?.match(/code is (\d{6})/i);
      if (match) return match[1];
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Verification email did not arrive for ${email}.`);
}

async function waitForCaptcha(page) {
  await page.waitForFunction(() => {
    const field = document.querySelector('input[name="captchaToken"]');
    return field instanceof HTMLInputElement && field.value.length > 10;
  }, null, { timeout: 15_000 });
}

async function startAdult(page, fullName, email) {
  await page.goto(new URL("/membership/apply", baseUrl).href);
  await page.locator('[name="date_of_birth"]').fill("02/04/1980");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('[name="full_name"]').fill(fullName);
  await page.locator('[name="contact_email"]').fill(email);
  await waitForCaptcha(page);
  const previousIds = await messageIds();
  await page.getByRole("button", { name: "Get code", exact: true }).click();
  await page.getByText(/Code sent/).waitFor();
  return waitForNewCode(email, previousIds);
}

async function enterCodeAndContinue(page, code) {
  await page.getByLabel("Six-digit verification code").fill(code);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function ensureOfficer() {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = users.data.users.find(candidate => candidate.email === officerEmail);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: officerEmail, password: officerPassword, email_confirm: true,
      user_metadata: { full_name: "Manual Membership Officer" },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { password: officerPassword, email_confirm: true });
    if (updated.error) throw updated.error;
  }
  const role = await admin.from("user_roles").upsert({ user_id: user.id, role: "committee" }, { onConflict: "user_id" });
  if (role.error) throw role.error;
  const capability = await admin.from("user_capabilities").upsert(
    { user_id: user.id, capability: "memberships.manage" }, { onConflict: "user_id,capability" },
  );
  if (capability.error) throw capability.error;
}

await clearSignupLimits();
await ensureOfficer();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let page = await context.newPage();
  const code = await startAdult(page, applicantName, applicantEmail);
  await enterCodeAndContinue(page, code === "000000" ? "111111" : "000000");
  await page.waitForFunction(() => {
    const message = document.querySelector(".membership-verification-message");
    return message?.getAttribute("data-tone") === "error" && /incorrect|expired|used/i.test(message.textContent || "");
  });
  await page.waitForFunction(() => {
    const message = document.querySelector(".membership-verification-message");
    return message && getComputedStyle(message).color === "rgb(165, 43, 31)";
  });
  assert.equal(await page.locator(".membership-verification-message").evaluate(element => getComputedStyle(element).color), "rgb(165, 43, 31)");
  results.push("Wrong code rejected with a stable red error");

  await enterCodeAndContinue(page, code);
  await page.getByRole("heading", { name: "Check and confirm." }).waitFor();
  results.push("Correct code accepted after an incorrect attempt");

  await page.reload();
  await page.locator('[name="date_of_birth"]').fill("02/04/1980");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(await page.locator('[name="full_name"]').inputValue(), applicantName);
  assert.equal(await page.locator('[name="contact_email"]').inputValue(), applicantEmail);
  assert.match(await page.getByRole("status").innerText(), /saved application/i);
  results.push("Abandoned verified draft restored after reload");

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('[name="terms"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('[name="payment_method"][value="cash"]').check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.waitForURL(/awaiting-cash/);
  results.push("Restored draft submitted once for cash");

  await clearSignupLimits();
  await context.clearCookies();
  page = await context.newPage();
  const duplicateCode = await startAdult(page, applicantName, applicantEmail);
  await enterCodeAndContinue(page, duplicateCode);
  await page.waitForFunction(() => /already saved/i.test(document.querySelector('[role="status"]')?.textContent || ""));
  results.push("Exact duplicate stopped at the existing application");
  await page.close();

  await clearSignupLimits();
  await context.clearCookies();
  page = await context.newPage();
  const familyName = `Manual Family ${runId}`;
  const familyCode = await startAdult(page, familyName, applicantEmail);
  await enterCodeAndContinue(page, familyCode);
  await page.getByRole("heading", { name: "Check and confirm." }).waitFor();
  results.push("Different family member sharing the email allowed to Review");
  await page.close();

  await context.clearCookies();
  page = await context.newPage();
  const year = new Date().getUTCFullYear();
  for (const [age, expected] of [[13, "too-young"], [14, "Junior associate"], [17, "Junior associate"], [18, "Adult"], [24, "Adult"], [25, "Adult"], [79, "Adult"], [80, "Concession"]]) {
    await page.goto(new URL("/membership/apply", baseUrl).href);
    await page.locator('[name="date_of_birth"]').fill(`01/01/${year - age}`);
    if (expected === "too-young") await page.getByText(/membership starts at age 14/i).waitFor();
    else await page.getByText(expected, { exact: true }).first().waitFor();
  }
  results.push("Age boundaries 13/14, 17/18, 24/25 and 79/80 reconciled");
  await page.close();

  await clearSignupLimits();
  await context.clearCookies();
  page = await context.newPage();
  const juniorEmail = `manual.junior.${runId}@example.test`;
  await page.goto(new URL("/membership/apply", baseUrl).href);
  await page.locator('[name="date_of_birth"]').fill(`01/01/${year - 15}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('[name="full_name"]').fill(`Manual Junior ${runId}`);
  await page.locator('[name="guardian_name"]').fill("Manual Guardian");
  await page.locator('[name="guardian_email"]').fill(juniorEmail);
  await waitForCaptcha(page);
  const previousIds = await messageIds();
  await page.getByRole("button", { name: "Get code", exact: true }).click();
  const juniorCode = await waitForNewCode(juniorEmail, previousIds);
  await page.getByLabel("Six-digit verification code").fill(juniorCode);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Tell us who’s joining." }).isVisible(), true);
  assert.equal(await page.locator('[name="guardian_consent"]').evaluate(element => !element.checkValidity()), true);
  await page.locator('[name="guardian_consent"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Check and confirm." }).waitFor();
  results.push("Missing Junior consent blocked; checked consent continued");
  await page.screenshot({ path: `${outputDirectory}-junior-review.png`, fullPage: true });
  await context.close();

  const officerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await officerContext.newPage();
  await page.goto(new URL(`/signin?method=password&next=${encodeURIComponent("/admin/memberships")}`, baseUrl).href);
  const signIn = page.locator(".auth-flip-back form").filter({ hasText: "Sign in securely" });
  await signIn.locator('[name="email"]').fill(officerEmail);
  await signIn.locator('[name="password"]').fill(officerPassword);
  await signIn.getByRole("button", { name: /Sign in securely/ }).click();
  await page.waitForURL(url => url.pathname === "/admin/memberships");

  const pendingCards = page.locator(".membership-verification-card");
  const pendingCount = await pendingCards.count();
  if (pendingCount > 0) {
    const approvedName = await pendingCards.nth(0).getByRole("heading", { level: 3 }).innerText();
    const card = page.locator(".membership-verification-card").filter({ hasText: approvedName }).first();
    await card.locator('[name="reason"]').fill("Eligibility checked against the submitted application.");
    await card.getByRole("button", { name: "Record verification" }).click();
    await page.waitForFunction(name => ![...document.querySelectorAll(".membership-verification-card h3")].some(heading => heading.textContent?.trim() === name), approvedName);
    results.push(`Officer confirmed paid membership for ${approvedName}`);
  }

  if (pendingCount > 1) {
    const deniedCard = page.locator(".membership-verification-card").first();
    const deniedName = await deniedCard.getByRole("heading", { level: 3 }).innerText();
    await deniedCard.locator('[name="decision"]').selectOption("denied");
    await deniedCard.locator('[name="reason"]').fill("Manual edge-case denial to verify suspension and refund follow-up.");
    await deniedCard.getByRole("button", { name: "Record verification" }).click();
    await page.waitForFunction(name => ![...document.querySelectorAll(".membership-verification-card h3")].some(heading => heading.textContent?.trim() === name), deniedName);
    results.push(`Officer denied paid membership for ${deniedName} and received a refund follow-up`);
  } else {
    results.push("Previously denied paid membership retained its manual refund follow-up");
  }
  await page.getByRole("heading", { name: "Manual refunds to arrange" }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${outputDirectory}-officer-reconciled.png`, fullPage: true });
  await officerContext.close();

  const { data: applications, error } = await admin.from("membership_applications")
    .select("full_name").eq("contact_email", applicantEmail);
  assert.equal(error, null);
  assert.equal(applications.filter(application => application.full_name === applicantName).length, 1);

  console.log(JSON.stringify({
    runId,
    applicantEmail,
    results,
    screenshots: [`${outputDirectory}-junior-review.png`, `${outputDirectory}-officer-reconciled.png`],
  }, null, 2));
} finally {
  await browser.close();
}
