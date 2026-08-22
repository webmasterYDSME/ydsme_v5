import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.describe("membership public, member and officer journeys", () => {
  test.skip(process.env.JOURNEY_MEMBERSHIP_TESTS !== "true", "Run with npm run test:membership-journeys.");
  test.describe.configure({ mode: "serial" });

  const password = process.env.JOURNEY_TEST_PASSWORD;
  const adultEmail = "journey.membership.adult@example.test";
  const studentEmail = "journey.membership.student@example.test";
  const juniorEmail = "journey.membership.junior@example.test";
  const concessionEmail = "journey.membership.concession@example.test";
  const guardianEmail = "journey.membership.guardian@example.test";
  const guardianLedEmail = "journey.membership.guardian-led@example.test";
  const fixtureEmails = [adultEmail, studentEmail, juniorEmail, concessionEmail, guardianLedEmail];
  const fixtureNamePrefix = "Journey Membership";
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let originalSettingsId;
  let originalSettingsIds = [];

  async function databaseRow(query, description) {
    const { data, error } = await query;
    expect(error, description).toBeNull();
    expect(data, description).toBeTruthy();
    return data;
  }

  async function cleanMembershipFixtures() {
    const { data: applications } = await admin.from("membership_applications").select("id").in("contact_email", fixtureEmails);
    const applicationIds = (applications ?? []).map(({ id }) => id);
    const { data: members } = await admin.from("members").select("id").ilike("full_name", `${fixtureNamePrefix}%`);
    const memberIds = (members ?? []).map(({ id }) => id);
    if (memberIds.length) {
      const { data: terms } = await admin.from("membership_terms").select("id").in("member_id", memberIds);
      const termIds = (terms ?? []).map(({ id }) => id);
      if (termIds.length) {
        await admin.from("membership_offline_payment_records").delete().in("term_id", termIds);
        await admin.from("membership_payments").delete().in("term_id", termIds);
      }
      await admin.from("membership_notifications").delete().in("member_id", memberIds);
      await admin.from("honorary_memberships").delete().in("member_id", memberIds);
      await admin.from("membership_subscriptions").delete().in("member_id", memberIds);
      await admin.from("membership_terms").delete().in("member_id", memberIds);
      await admin.from("members").delete().in("id", memberIds);
    }
    if (applicationIds.length) {
      await admin.from("membership_notifications").delete().in("application_id", applicationIds);
      await admin.from("membership_offline_payment_records").delete().in("application_id", applicationIds);
      await admin.from("membership_applications").delete().in("id", applicationIds);
    }
  }

  async function signIn(page, email, next = "/dashboard") {
    await page.context().clearCookies();
    await page.goto(`/signin?method=password&next=${encodeURIComponent(next)}`);
    const form = page.locator(".auth-flip-back form").filter({ hasText: "Sign in securely" });
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await form.getByRole("button", { name: /Sign in securely/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/signin"));
  }

  async function submitApplication(page, details) {
    await page.goto("/membership/apply");
    const form = page.locator("form.membership-application-form");
    await form.locator('input[name="date_of_birth"]').fill(details.dateOfBirth);
    if (details.planSlug) {
      await form.locator(`input[name="eligible_plan_choice"][value="${details.planSlug}"]`).check();
    }
    if (details.guardianName) {
      await form.locator('input[name="guardian_name"]').fill(details.guardianName);
      await form.locator('input[name="guardian_email"]').fill(details.guardianEmail);
      if (details.guardianLed) await form.locator('input[name="guardian_led"]').check();
      await form.locator('input[name="guardian_consent"]').check();
    }
    await form.getByRole("button", { name: "Continue" }).click();
    await form.locator('input[name="full_name"]').fill(details.fullName);
    if (!details.guardianLed) await form.locator('input[name="contact_email"]').fill(details.email);
    await form.getByRole("button", { name: "Continue" }).click();
    await form.locator(`input[name="payment_method"][value="${details.paymentMethod}"]`).check();
    await form.getByRole("button", { name: "Continue" }).click();
    await form.locator('input[name="terms"]').check();
    await form.getByRole("button", { name: /Verify and continue/ }).click();
    await page.waitForURL(/\/membership\/apply\?application=received/);
    await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
    await expect(page.locator("form.membership-application-form")).toHaveCount(0);
  }

  async function latestAction(applicationId, kind) {
    const notification = await databaseRow(
      admin.from("membership_notifications").select("action_href").eq("application_id", applicationId)
        .eq("kind", kind).order("created_at", { ascending: false }).limit(1).single(),
      `Missing ${kind} notification`,
    );
    expect(notification.action_href).toBeTruthy();
    return notification.action_href;
  }

  test.beforeAll(async () => {
    expect(password?.length).toBeGreaterThanOrEqual(12);
    await cleanMembershipFixtures();
    const settings = await databaseRow(
      admin.from("membership_payment_settings_versions").select("id,active").order("version"),
      "Unable to capture membership payment settings",
    );
    originalSettingsIds = settings.map(({ id }) => id);
    originalSettingsId = settings.find(({ active }) => active)?.id;
  });

  test.afterAll(async () => {
    await cleanMembershipFixtures();
    const { data: settings } = await admin.from("membership_payment_settings_versions").select("id,active");
    for (const setting of settings ?? []) {
      if (setting.active && setting.id !== originalSettingsId) {
        await admin.from("membership_payment_settings_versions").update({ active: false }).eq("id", setting.id);
      }
    }
    if (originalSettingsId) {
      await admin.from("membership_payment_settings_versions").update({ active: true }).eq("id", originalSettingsId);
    }
    for (const setting of settings ?? []) {
      if (!originalSettingsIds.includes(setting.id)) {
        await admin.from("membership_payment_settings_versions").delete().eq("id", setting.id);
      }
    }
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const committee = users.data.users.find(({ email }) => email === "journey.committee@example.test");
    if (committee) await admin.from("user_capabilities").delete().eq("user_id", committee.id).eq("capability", "memberships.manage");
  });

  test("DOB selects plans, defaults Adult over Student, and protects junior details", async ({ page }) => {
    await page.goto("/membership/apply");
    const dob = page.locator('input[name="date_of_birth"]');

    await dob.fill("2004-08-20");
    await expect(page.getByRole("group", { name: "Choose your membership" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Adult/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Student/ })).not.toBeChecked();

    await dob.fill("2010-01-01");
    await expect(page.getByRole("group", { name: "Guardian details and consent" })).toBeVisible();
    await expect(page.locator('input[name="guardian_email"]')).toHaveAttribute("required", "");

    await dob.fill("2013-01-01");
    await expect(page.getByText("No available membership matches the age entered.")).toBeVisible();
    await expect(page.getByText("OFFICER APPROVAL")).toHaveCount(0);
  });

  test("application presents one validated stage at a time", async ({ page }) => {
    await page.goto("/membership/apply");
    const form = page.locator("form.membership-application-form");
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(form.getByRole("heading", { name: "We’ll find the right plan." })).toBeVisible();
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.locator('input[name="date_of_birth"]')).toBeFocused();
    await form.locator('input[name="date_of_birth"]').fill("1980-04-02");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await expect(form.getByRole("heading", { name: "How can we reach you?" })).toBeVisible();
    await form.getByRole("button", { name: "Back" }).click();
    await expect(form.locator('input[name="date_of_birth"]')).toHaveValue("1980-04-02");
  });

  test("exact applications resume while different people may share one correspondence email", async ({ page }) => {
    const firstName = `${fixtureNamePrefix} Adult Applicant`;
    await submitApplication(page, {
      dateOfBirth: "1980-04-02", fullName: firstName,
      email: adultEmail, paymentMethod: "cash",
    });
    const application = await databaseRow(
      admin.from("membership_applications").select("id,status,requested_plan_id").eq("contact_email", adultEmail).single(),
      "Adult application was not stored",
    );
    expect(application.status).toBe("email_verification_pending");
    const verificationHref = await latestAction(application.id, "membership.application-verify");
    await page.goto(verificationHref);
    await page.waitForURL(/application=awaiting-cash/);
    const verified = await databaseRow(
      admin.from("membership_applications").select("status,email_verified_at").eq("id", application.id).single(),
      "Adult application did not verify",
    );
    expect(verified.status).toBe("awaiting_cash");
    expect(verified.email_verified_at).toBeTruthy();

    await page.goto(verificationHref);
    await page.waitForURL(/application=link-invalid/);
    await submitApplication(page, {
      dateOfBirth: "1980-04-02", fullName: firstName,
      email: adultEmail.toUpperCase(), paymentMethod: "cash",
    });
    let applicationCount = await admin.from("membership_applications").select("id", { count: "exact", head: true }).eq("contact_email", adultEmail);
    expect(applicationCount.error).toBeNull();
    expect(applicationCount.count).toBe(1);

    await submitApplication(page, {
      dateOfBirth: "1982-07-10", fullName: `${fixtureNamePrefix} Shared Address Adult`,
      email: adultEmail, paymentMethod: "cash",
    });
    applicationCount = await admin.from("membership_applications").select("id", { count: "exact", head: true }).eq("contact_email", adultEmail);
    expect(applicationCount.error).toBeNull();
    expect(applicationCount.count).toBe(2);
  });

  test("junior applicant and guardian verify separately before officer approval", async ({ page }) => {
    await submitApplication(page, {
      dateOfBirth: "2010-01-01", fullName: `${fixtureNamePrefix} Junior Applicant`, email: juniorEmail,
      guardianName: `${fixtureNamePrefix} Guardian`, guardianEmail, paymentMethod: "cheque",
    });
    const application = await databaseRow(
      admin.from("membership_applications").select("id,status").eq("contact_email", juniorEmail).single(),
      "Junior application was not stored",
    );
    const verificationHref = await latestAction(application.id, "membership.application-verify");
    await page.goto(verificationHref);
    await page.waitForURL(/application=guardian-verification/);
    const guardianHref = await latestAction(application.id, "membership.guardian-verification");
    await page.goto(guardianHref);
    await expect(page.getByRole("heading", { name: "Confirm guardian consent." })).toBeVisible();
    const beforeConsent = await databaseRow(
      admin.from("membership_applications").select("status,guardian_verified_at").eq("id", application.id).single(),
      "Unable to inspect guardian application",
    );
    expect(beforeConsent.status).toBe("guardian_verification_pending");
    expect(beforeConsent.guardian_verified_at).toBeNull();

    await page.getByRole("button", { name: "I confirm my consent" }).click();
    await page.waitForURL(/consent=confirmed/);
    const afterConsent = await databaseRow(
      admin.from("membership_applications").select("status,guardian_verified_at").eq("id", application.id).single(),
      "Guardian consent did not advance the application",
    );
    expect(afterConsent.status).toBe("awaiting_approval");
    expect(afterConsent.guardian_verified_at).toBeTruthy();
  });

  test("guardian-led Junior uses one verification and consent message without a Junior login", async ({ page }) => {
    await submitApplication(page, {
      dateOfBirth: "2010-06-15", fullName: `${fixtureNamePrefix} Guardian Led Junior`, email: "",
      guardianName: `${fixtureNamePrefix} Guardian Led Adult`, guardianEmail: guardianLedEmail,
      guardianLed: true, paymentMethod: "cash",
    });
    const application = await databaseRow(
      admin.from("membership_applications").select("id,status,contact_email,contact_role,guardian_led,guardian_verified_at,portal_invitation_status")
        .eq("full_name", `${fixtureNamePrefix} Guardian Led Junior`).single(),
      "Guardian-led application was not stored",
    );
    expect(application).toMatchObject({
      status: "email_verification_pending",
      contact_email: guardianLedEmail,
      contact_role: "guardian",
      guardian_led: true,
      portal_invitation_status: "not_requested",
    });
    const guardianMessages = await admin.from("membership_notifications").select("kind")
      .eq("application_id", application.id).eq("kind", "membership.guardian-verification");
    expect(guardianMessages.error).toBeNull();
    expect(guardianMessages.data).toHaveLength(0);
    const verificationHref = await latestAction(application.id, "membership.application-verify");
    await page.goto(verificationHref);
    await page.waitForURL(/application=awaiting-approval/);
    const verified = await databaseRow(
      admin.from("membership_applications").select("status,email_verified_at,guardian_verified_at").eq("id", application.id).single(),
      "Guardian-led verification did not record consent",
    );
    expect(verified.status).toBe("awaiting_approval");
    expect(verified.email_verified_at).toBeTruthy();
    expect(verified.guardian_verified_at).toBeTruthy();
  });

  test("Student and Concession complete verification, approval, payment and activation independently", async ({ page }) => {
    for (const applicant of [
      {
        dateOfBirth: "2004-06-15", fullName: `${fixtureNamePrefix} Student Applicant`,
        email: studentEmail, planSlug: "student", expectedSlug: "student", reference: "JOURNEY-STUDENT-CASH-001",
      },
      {
        dateOfBirth: "1940-03-10", fullName: `${fixtureNamePrefix} Concession Applicant`,
        email: concessionEmail, expectedSlug: "concession", reference: "JOURNEY-CONCESSION-CASH-001",
      },
    ]) {
      await submitApplication(page, { ...applicant, paymentMethod: "cash" });
      const application = await databaseRow(
        admin.from("membership_applications").select("id,status").eq("contact_email", applicant.email).single(),
        `${applicant.expectedSlug} application was not stored`,
      );
      await page.goto(await latestAction(application.id, "membership.application-verify"));
      await page.waitForURL(/application=awaiting-approval/);
      const verified = await databaseRow(
        admin.from("membership_applications").select("status,email_verified_at").eq("id", application.id).single(),
        `${applicant.expectedSlug} application did not verify`,
      );
      expect(verified.status).toBe("awaiting_approval");
      expect(verified.email_verified_at).toBeTruthy();
    }

    await signIn(page, "journey.administrator@example.test", "/admin/memberships?section=applications#applications");
    for (const applicant of [
      { email: studentEmail, expectedSlug: "student", reference: "JOURNEY-STUDENT-CASH-001" },
      { email: concessionEmail, expectedSlug: "concession", reference: "JOURNEY-CONCESSION-CASH-001" },
    ]) {
      let article = page.locator("#applications .membership-queue-list article").filter({ hasText: applicant.email }).first();
      await article.getByRole("button", { name: "Approve application" }).click();
      await page.waitForURL(/notice=application-approved/);
      article = page.locator("#applications .membership-queue-list article").filter({ hasText: applicant.email }).first();
      const paymentForm = article.locator("form").filter({ hasText: "Mark paid and activate" });
      await paymentForm.locator('input[name="payment_reference"]').fill(applicant.reference);
      await paymentForm.getByRole("button", { name: "Mark paid and activate" }).click();
      await page.waitForURL(/notice=offline-payment-confirmed/);

      const member = await databaseRow(
        admin.from("members").select("id,effective_state,auth_user_id,current_plan_id")
          .eq("contact_email", applicant.email).single(),
        `${applicant.expectedSlug} member was not activated`,
      );
      expect(member.effective_state).toBe("active");
      expect(member.auth_user_id).toBeTruthy();
      const plan = await databaseRow(
        admin.from("membership_plans").select("slug").eq("id", member.current_plan_id).single(),
        `${applicant.expectedSlug} plan is missing`,
      );
      expect(plan.slug).toBe(applicant.expectedSlug);
      const term = await databaseRow(
        admin.from("membership_terms").select("id,status,amount_due_pence,amount_paid_pence").eq("member_id", member.id).single(),
        `${applicant.expectedSlug} term is missing`,
      );
      expect(term).toMatchObject({ status: "paid", amount_paid_pence: term.amount_due_pence });
      const payment = await databaseRow(
        admin.from("membership_payments").select("method,status,offline_reference").eq("term_id", term.id).single(),
        `${applicant.expectedSlug} payment is missing`,
      );
      expect(payment).toMatchObject({ method: "cash", status: "paid", offline_reference: applicant.reference });
      await page.goto("/admin/memberships?section=applications#applications");
    }
  });

  test("membership officer page fits desktop, tablet and phone widths", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/admin/memberships?section=add-member#add-member");
    for (const width of [1440, 1100, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Manage memberships", exact: true })).toBeVisible();
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(horizontalOverflow, `Page overflowed at ${width}px`).toBeLessThanOrEqual(1);
      const form = page.locator("form.membership-manual-create-form");
      await form.locator('input[name="date_of_birth"]').fill("1985-05-12");
      await expect(form.getByText("£25.00", { exact: true })).toBeVisible();
      const chargeBox = await form.locator(".membership-manual-charge").boundingBox();
      expect(chargeBox?.width ?? 0, `Charge summary was too narrow at ${width}px`).toBeGreaterThan(240);
    }
  });

  test("officer approves and clears a cheque without activating on receipt alone", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/admin/memberships");
    await expect(page.getByRole("heading", { name: "Manage memberships", exact: true })).toBeVisible();
    let article = page.locator(".membership-queue-list article").filter({ hasText: juniorEmail }).first();
    let form = article.locator("form").filter({ hasText: "Approve application" });
    await form.getByRole("button", { name: "Approve application" }).click();
    await page.waitForURL(/notice=application-approved/);

    article = page.locator(".membership-queue-list article").filter({ hasText: juniorEmail }).first();
    form = article.locator("form").filter({ hasText: "Mark cheque as received" });
    await form.locator('input[name="payment_reference"]').fill("JOURNEY-CHEQUE-001");
    await form.getByRole("button", { name: "Mark cheque as received" }).click();
    await page.waitForURL(/notice=offline-payment-received/);
    let application = await databaseRow(
      admin.from("membership_applications").select("id,status,converted_member_id").eq("contact_email", juniorEmail).single(),
      "Unable to inspect received cheque",
    );
    expect(application.status).toBe("awaiting_cheque");
    expect(application.converted_member_id).toBeNull();

    article = page.locator(".membership-queue-list article").filter({ hasText: juniorEmail }).first();
    form = article.locator("form").filter({ hasText: "Mark paid and activate" });
    await form.locator('input[name="payment_reference"]').fill("JOURNEY-CHEQUE-001");
    await form.locator('input[name="cleared"]').check();
    await form.getByRole("button", { name: "Mark paid and activate" }).click();
    await page.waitForURL(/notice=offline-payment-confirmed/);
    application = await databaseRow(
      admin.from("membership_applications").select("status,converted_member_id").eq("contact_email", juniorEmail).single(),
      "Cleared cheque did not convert the application",
    );
    expect(application.status).toBe("converted");
    const term = await databaseRow(
      admin.from("membership_terms").select("id,status,amount_due_pence,amount_paid_pence").eq("member_id", application.converted_member_id).single(),
      "Junior term was not activated",
    );
    expect(term.status).toBe("paid");
    expect(term.amount_paid_pence).toBe(term.amount_due_pence);
    const payment = await databaseRow(
      admin.from("membership_payments").select("method,status,offline_reference,cleared_at").eq("term_id", term.id).single(),
      "Cheque payment evidence is missing",
    );
    expect(payment).toMatchObject({ method: "cheque", status: "paid", offline_reference: "JOURNEY-CHEQUE-001" });
    expect(payment.cleared_at).toBeTruthy();
    const guardianCopy = await databaseRow(
      admin.from("membership_notifications").select("email_status,portal_visible")
        .eq("member_id", application.converted_member_id).eq("recipient_email", guardianEmail)
        .eq("kind", "membership.activated").single(),
      "Guardian activation copy is missing",
    );
    expect(guardianCopy.portal_visible).toBe(false);
    expect(guardianCopy.email_status).not.toBe("cancelled");
  });

  test("officer creates paid and pending memberships and the linked member sees their account", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/admin/memberships?section=add-member#add-member");
    let form = page.locator("form.membership-manual-create-form");
    await form.locator('input[name="full_name"]').fill(`${fixtureNamePrefix} Linked Member`);
    await form.locator('input[name="date_of_birth"]').fill("1985-05-12");
    await expect(form.getByText("£25.00", { exact: true })).toBeVisible();
    await expect(form.getByText(/5 months through 31 December 2026/)).toBeVisible();
    await form.locator('input[name="contact_email"]').fill("journey.member@example.test");
    await form.locator('select[name="payment_method"]').selectOption("cash");
    await form.locator('input[name="payment_reference"]').fill("JOURNEY-CASH-001");
    await form.locator('input[name="payment_received"]').check();
    await form.getByRole("button", { name: "Add member" }).click();
    await page.waitForURL(/notice=officer-member-created/);
    let linkedMember = await databaseRow(
      admin.from("members").select("id,auth_user_id,effective_state,portal_invitation_status").eq("full_name", `${fixtureNamePrefix} Linked Member`).single(),
      "Officer-created member is missing",
    );
    expect(linkedMember.auth_user_id).toBeNull();
    expect(linkedMember.portal_invitation_status).toBe("blocked_shared");
    expect(linkedMember.effective_state).toBe("active");

    await page.goto(`/admin/memberships?member=${linkedMember.id}&section=member-history#member-history`);
    const portalForm = page.locator("#member-history form").filter({ hasText: "Assign or invite website login" });
    await portalForm.locator('input[name="login_email"]').fill("journey.member@example.test");
    await portalForm.locator('textarea[name="reason"]').fill("Confirmed this existing website account belongs to the named member.");
    await portalForm.getByRole("button", { name: "Assign or invite website login" }).click();
    await page.waitForURL(/notice=portal-login-assigned/);
    linkedMember = await databaseRow(
      admin.from("members").select("id,auth_user_id,effective_state,portal_invitation_status").eq("id", linkedMember.id).single(),
      "Officer-confirmed portal login was not linked",
    );
    expect(linkedMember.auth_user_id).toBeTruthy();
    await expect.poll(async () => {
      const { data } = await admin.from("membership_notifications")
        .select("email_status,action_href,recipient_user_id")
        .eq("member_id", linkedMember.id)
        .eq("kind", "membership.portal-access-ready")
        .single();
      return data;
    }).toMatchObject({
      email_status: "sent",
      action_href: "/auth/switch-account?next=/account",
      recipient_user_id: linkedMember.auth_user_id,
    });

    await page.goto("/admin/memberships?section=add-member#add-member");
    form = page.locator("form.membership-manual-create-form");
    await form.locator('input[name="full_name"]').fill(`${fixtureNamePrefix} Pending Bank`);
    await form.locator('input[name="date_of_birth"]').fill("1975-02-14");
    await form.locator('input[name="contact_number"]').fill("01904 000001");
    await form.locator('select[name="payment_method"]').selectOption("bank_transfer");
    await form.getByRole("button", { name: "Add member" }).click();
    await page.waitForURL(/notice=officer-member-created/);
    let pendingMember = await databaseRow(
      admin.from("members").select("id,effective_state").eq("full_name", `${fixtureNamePrefix} Pending Bank`).single(),
      "Pending officer-created member is missing",
    );
    expect(pendingMember.effective_state).toBe("lapsed");
    const pendingTerm = await databaseRow(
      admin.from("membership_terms").select("status,expected_payment_method").eq("member_id", pendingMember.id).single(),
      "Pending officer-created term is missing",
    );
    expect(pendingTerm).toMatchObject({ status: "scheduled", expected_payment_method: "bank_transfer" });

    await page.goto("/admin/memberships?section=pending-payments#pending-payments");
    const article = page.locator(".membership-queue-list article").filter({ hasText: `${fixtureNamePrefix} Pending Bank` }).first();
    form = article.locator("form").filter({ hasText: "Mark paid and activate" });
    await form.locator('input[name="payment_reference"]').fill("JOURNEY-BANK-001");
    await form.getByRole("button", { name: "Mark paid and activate" }).click();
    await page.waitForURL(/notice=offline-renewal-confirmed/);
    pendingMember = await databaseRow(
      admin.from("members").select("effective_state").eq("id", pendingMember.id).single(),
      "Pending member did not activate",
    );
    expect(pendingMember.effective_state).toBe("active");

    await page.goto("/admin/memberships?section=renewals#renewals");
    const renewalForm = page.locator("form.membership-cash-renewal-form");
    await renewalForm.locator('select[name="member_id"]').selectOption(linkedMember.id);
    await expect(renewalForm.locator('select[name="membership_year"]')).toHaveValue("2027");
    await expect(renewalForm.getByText("£60.00", { exact: true })).toBeVisible();
    await expect(renewalForm.getByText("Full annual fee for 2027.", { exact: true })).toBeVisible();
    await expect(renewalForm.getByRole("button", { name: "Record renewal payment" })).toBeEnabled();
    await renewalForm.locator('select[name="membership_year"]').selectOption("2026");
    await expect(renewalForm.getByText("No payment due", { exact: true })).toBeVisible();
    await expect(renewalForm.getByText(/2026 membership is already paid/)).toBeVisible();
    await expect(renewalForm.getByRole("button", { name: "Record renewal payment" })).toBeDisabled();

    await signIn(page, "journey.member@example.test", "/account");
    await expect(page.getByRole("heading", { name: "Account details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adult" })).toBeVisible();
    await expect(page.getByText("Membership paid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to payment" })).toHaveCount(0);
    await expect(page.getByText("Your Society membership is active", { exact: true })).toBeVisible();
    await expect(page.getByText("JOURNEY-CASH-001")).toHaveCount(0);
    await page.getByText("Membership and payment history", { exact: true }).click();
    await expect(page.getByText("cash · paid ·", { exact: false })).toBeVisible();
  });

  test("honorary creation has no payment and produces a manual-contact task", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/admin/memberships?section=honorary#honorary");
    const section = page.locator("#honorary");
    const form = section.locator("form").filter({ hasText: "Add a new honorary member" });
    await form.locator('input[name="full_name"]').fill(`${fixtureNamePrefix} Honorary`);
    await form.locator('input[name="contact_number"]').fill("01904 000002");
    await form.locator('input[name="effective_from"]').fill(new Date().toISOString().slice(0, 10));
    await form.locator('textarea[name="reason"]').fill("Exceptional lifetime service to the Society.");
    await form.getByRole("button", { name: "Add honorary member" }).click();
    await page.waitForURL(/notice=honorary-scheduled/);
    const member = await databaseRow(
      admin.from("members").select("id,effective_state").eq("full_name", `${fixtureNamePrefix} Honorary`).single(),
      "Honorary member was not created",
    );
    expect(member.effective_state).toBe("honorary");
    const payments = await admin.from("membership_terms").select("id", { count: "exact", head: true }).eq("member_id", member.id);
    expect(payments.count).toBe(0);
    const manualTask = await databaseRow(
      admin.from("membership_notifications").select("id").eq("member_id", member.id)
        .eq("kind", "membership.manual-contact-officer").is("read_at", null).limit(1).single(),
      "Honorary manual-contact task was not created",
    );
    await page.goto("/admin/memberships?section=manual-contact#manual-contact");
    const honoraryTasks = page.locator("#manual-contact .membership-queue-list article").filter({ hasText: `${fixtureNamePrefix} Honorary` });
    await expect(honoraryTasks).toHaveCount(1);
    const taskArticle = honoraryTasks.first();
    const taskForm = taskArticle.locator("form").filter({ hasText: "Mark all updates as contacted" });
    await taskForm.locator('textarea[name="reason"]').fill("Telephoned the member and confirmed the designation.");
    await taskForm.getByRole("button", { name: "Mark all updates as contacted" }).click();
    await page.waitForURL(/notice=manual-contact-completed/);
    const completed = await databaseRow(
      admin.from("membership_notifications").select("read_at").eq("id", manualTask.id).single(),
      "Manual-contact task was not completed",
    );
    expect(completed.read_at).toBeTruthy();
  });

  test("administrator configures versioned payment instructions and bank transfer becomes public", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/settings?tab=membership");
    const form = page.locator("form.editor-form");
    await form.locator('input[name="treasurer_name"]').fill("Journey Treasurer");
    await form.locator('input[name="treasurer_email"]').fill("journey.treasurer@example.test");
    await form.locator('input[name="bank_account_name"]').fill("Journey Society Test Account");
    await form.locator('input[name="bank_sort_code"]').fill("00-11-22");
    await form.locator('input[name="bank_account_number"]').fill("12345678");
    await form.locator('textarea[name="bank_transfer_instructions"]').fill("Use the supplied membership reference for this local journey test.");
    await form.locator('input[name="cheque_payee"]').fill("Journey Society Test");
    await form.locator('textarea[name="cheque_delivery_instructions"]').fill("Deliver the test cheque to the test Treasurer.");
    await form.locator('textarea[name="cash_instructions"]').fill("Arrange the complete test cash payment with an officer.");
    await form.getByRole("button", { name: "Save a new payment-settings version" }).click();
    await page.waitForURL(/notice=membership-payment-settings-saved/);
    const activeSettings = await databaseRow(
      admin.from("membership_payment_settings_versions").select("configured,treasurer_email").eq("active", true).single(),
      "Payment settings did not activate",
    );
    expect(activeSettings).toMatchObject({ configured: true, treasurer_email: "journey.treasurer@example.test" });
    await page.goto("/membership/apply");
    await expect(page.locator('input[value="bank_transfer"]')).toBeEnabled();
    await expect(page.getByRole("link", { name: "Journey Treasurer" })).toHaveAttribute("href", "mailto:journey.treasurer@example.test");
    await expect(page.getByText("12345678")).toHaveCount(0);
  });

  test("administrator grants least-privilege membership access and revocation takes effect", async ({ page }) => {
    await signIn(page, "journey.administrator@example.test", "/admin/memberships?section=officer-access#officer-access");
    const officerArticle = page.locator(".membership-queue-list article").filter({ hasText: "Journey Committee" }).last();
    await officerArticle.getByRole("button", { name: "Give membership access" }).click();
    await page.waitForURL(/notice=officer-updated/);

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const committee = users.data.users.find(({ email }) => email === "journey.committee@example.test");
    expect(committee).toBeTruthy();
    const capability = await databaseRow(
      admin.from("user_capabilities").select("capability").eq("user_id", committee.id).eq("capability", "memberships.manage").single(),
      "Membership capability was not granted",
    );
    expect(capability.capability).toBe("memberships.manage");

    await signIn(page, "journey.committee@example.test", "/admin/memberships");
    await expect(page.getByRole("heading", { name: "Manage memberships", exact: true })).toBeVisible();
    await admin.from("user_capabilities").delete().eq("user_id", committee.id).eq("capability", "memberships.manage");
    await page.reload();
    await expect(page).not.toHaveURL(/\/admin\/memberships/);
  });
});
