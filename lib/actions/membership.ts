"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  MEMBERMOJO_MEMBERSHIP_URL,
  membershipAdministrationEnabled,
  membershipBillingEnabled,
  membershipMode,
  membershipPilotAllows,
  membershipRecoveryEnabled,
} from "@/lib/features";
import {
  defaultMembershipPlan,
  eligibleMembershipPlans,
  membershipBillingYear,
  proratedMembershipFee,
} from "@/lib/membership-rules";
import {
  createMemberRenewalCheckout,
  createApplicationCheckoutFromToken,
  createMembershipPortal,
  ensureMemberPortalInvitation,
  ensureMembershipPlanPrice,
  emailFromNewsletterUnsubscribeToken,
  membershipToken,
  membershipTokenHash,
  processMembershipProviderCommands,
  MEMBERSHIP_TERMS_VERSION,
} from "@/lib/membership";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  getMembershipPaymentSettings,
  membershipPaymentReference,
  offlinePaymentInstructions,
} from "@/lib/membership-settings";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import { verifyTurnstile } from "@/lib/turnstile";

const idSchema = z.string().uuid();
const londonToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const normalizeIdentityName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
const postgrestLikeLiteral = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
const applicationSchema = z.object({
  plan_id: z.string().uuid().optional(),
  title: z.string().trim().max(30).default(""),
  full_name: z.string().trim().min(2).max(180),
  contact_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
  contact_number: z.string().trim().max(40).optional().transform((value) => value || null),
  date_of_birth: z.iso.date(),
  payment_method: z.enum(["stripe", "cash", "bank_transfer", "cheque"]),
  auto_renew: z.string().optional().transform((value) => value === "on"),
  student_declaration: z.string().optional().transform((value) => value === "on"),
  guardian_name: z.string().trim().max(180).optional().transform((value) => value || null),
  guardian_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
  guardian_consent: z.string().optional().transform((value) => value === "on"),
  guardian_led: z.string().optional().transform((value) => value === "on"),
  shared_contact: z.string().optional().transform((value) => value === "on"),
  newsletter_opt_in: z.string().optional().transform((value) => value === "on"),
  terms: z.literal("on"),
});

export async function submitMembershipApplication(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const parsed = applicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/membership/apply?application=invalid");
  const applicationEmail = parsed.data.guardian_led ? parsed.data.guardian_email : parsed.data.contact_email;
  if (!applicationEmail) redirect("/membership/apply?application=invalid");
  if (!membershipPilotAllows(applicationEmail)) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  if (membershipMode() === "live") {
    const { count, error: blockerError } = await createServiceClient().from("membership_migration_reviews")
      .select("id", { count: "exact", head: true }).eq("status", "pending");
    if (blockerError || (count ?? 0) > 0) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  }
  if (!await verifyTurnstile(String(formData.get("captchaToken") || ""))) {
    redirect("/membership/apply?application=security-check");
  }
  if (!await consumeRateLimit("membership-application", 5, 60 * 60, applicationEmail)) {
    redirect("/membership/apply?application=received");
  }

  const admin = createServiceClient();
  const { data: activePlans } = await admin.from("membership_plans")
    .select("id,slug,name,minimum_age,maximum_age,requires_approval,active")
    .eq("active", true);
  const eligibility = eligibleMembershipPlans(activePlans ?? [], parsed.data.date_of_birth);
  const requestedPlan = parsed.data.plan_id
    ? eligibility.plans.find((candidate) => candidate.id === parsed.data.plan_id)
    : null;
  let plan = defaultMembershipPlan(eligibility.plans);
  if (requestedPlan?.slug === "student") {
    if (!parsed.data.student_declaration) redirect("/membership/apply?application=eligibility");
    plan = requestedPlan;
  } else if (parsed.data.plan_id && activePlans?.some((candidate) => candidate.id === parsed.data.plan_id && candidate.slug === "student")) {
    redirect("/membership/apply?application=eligibility");
  }
  if (!plan) redirect("/membership/apply?application=eligibility");
  const junior = plan.slug === "junior";
  if (junior && (!parsed.data.guardian_name || !parsed.data.guardian_email || !parsed.data.guardian_consent)) {
    redirect("/membership/apply?application=eligibility");
  }
  if (parsed.data.guardian_led && !junior) redirect("/membership/apply?application=eligibility");
  if (junior && parsed.data.guardian_email === applicationEmail && !parsed.data.guardian_led) {
    redirect("/membership/apply?application=eligibility");
  }

  const escapedEmail = postgrestLikeLiteral(applicationEmail);
  const identityName = normalizeIdentityName(parsed.data.full_name);
  const [{ data: memberCandidates }, { data: applicationCandidates }] = await Promise.all([
    admin.from("members").select("id,auth_user_id,contact_email,full_name")
      .ilike("contact_email", escapedEmail)
      .eq("date_of_birth", parsed.data.date_of_birth).neq("effective_state", "archived"),
    admin.from("membership_applications").select("id,status,full_name")
      .ilike("contact_email", escapedEmail)
      .eq("date_of_birth", parsed.data.date_of_birth)
      .not("status", "in", "(converted,rejected,expired)"),
  ]);
  const existingMember = memberCandidates?.find((candidate) => normalizeIdentityName(candidate.full_name) === identityName);
  const existingApplication = applicationCandidates?.find((candidate) => normalizeIdentityName(candidate.full_name) === identityName);
  if (existingMember) {
    await admin.from("membership_notifications").insert({
      member_id: existingMember.id, recipient_user_id: existingMember.auth_user_id,
      recipient_email: existingMember.contact_email, kind: "membership.duplicate-application",
      title: `A membership application used ${existingMember.full_name}'s email address`,
      body: `A new application was submitted using the correspondence email on ${existingMember.full_name}'s membership record. No duplicate membership or payment was created. Sign in to renew, or contact the membership officer if this was not you.`,
      action_href: existingMember.auth_user_id ? "/account" : null, portal_visible: Boolean(existingMember.auth_user_id),
      deduplication_key: `duplicate-membership-application-${existingMember.id}-${new Date().toISOString().slice(0, 10)}`,
    });
    redirect("/membership/apply?application=received");
  }
  if (existingApplication) {
    const statusToken = membershipToken();
    await admin.from("membership_applications").update({
      application_status_token_hash: membershipTokenHash(statusToken),
      application_status_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", existingApplication.id);
    await admin.from("membership_notifications").insert({
      application_id: existingApplication.id,
      recipient_email: applicationEmail,
      kind: "membership.application-resumed",
      title: `${parsed.data.full_name}'s membership application is already saved`,
      body: `A second application or payment has not been created. Open the secure link to see the current stage of ${parsed.data.full_name}'s application.`,
      action_href: `/membership/status?token=${encodeURIComponent(statusToken)}`,
      portal_visible: false,
      deduplication_key: `application-resumed-${existingApplication.id}-${new Date().toISOString().slice(0, 10)}`,
    });
    redirect("/membership/apply?application=received");
  }

  const token = membershipToken();
  const statusToken = membershipToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const paymentSettings = await getMembershipPaymentSettings();
  if (parsed.data.payment_method === "bank_transfer" && !paymentSettings.configured) {
    redirect("/membership/apply?application=payment-method-unavailable");
  }
  const { data: application, error } = await admin.from("membership_applications").insert({
    requested_plan_id: plan.id,
    title: parsed.data.title,
    full_name: parsed.data.full_name,
    contact_email: applicationEmail,
    contact_number: parsed.data.contact_number,
    date_of_birth: parsed.data.date_of_birth,
    payment_method: parsed.data.payment_method,
    auto_renew: parsed.data.payment_method === "stripe" && parsed.data.auto_renew,
    student_declaration: parsed.data.student_declaration,
    guardian_name: parsed.data.guardian_name,
    guardian_email: parsed.data.guardian_email,
    guardian_consent: parsed.data.guardian_consent,
    guardian_led: parsed.data.guardian_led,
    contact_role: parsed.data.guardian_led ? "guardian" : parsed.data.shared_contact ? "shared_household" : "self",
    portal_invitation_status: parsed.data.guardian_led ? "not_requested" : "eligible",
    newsletter_opt_in: parsed.data.newsletter_opt_in,
    payment_settings_version_id: paymentSettings.id === "default" ? null : paymentSettings.id,
    verification_token_hash: membershipTokenHash(token),
    verification_expires_at: expiresAt.toISOString(),
    application_status_token_hash: membershipTokenHash(statusToken),
    application_status_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    terms_version: MEMBERSHIP_TERMS_VERSION,
    terms_accepted_at: now.toISOString(),
  }).select("id").single();

  // Keep the public response deliberately generic for both duplicate and new identities.
  if (!error && application) {
    await admin.from("membership_notifications").insert({
      application_id: application.id,
      recipient_email: applicationEmail,
      kind: "membership.application-verify",
      title: `Verify ${parsed.data.full_name}'s membership application`,
      body: parsed.data.guardian_led
        ? `Confirm this email address and your consent for ${parsed.data.full_name}'s Junior membership application.`
        : `Confirm your email address to continue ${parsed.data.full_name}'s ${plan.name} membership application.`,
      action_href: `/membership/verify?token=${encodeURIComponent(token)}`,
      portal_visible: false,
      deduplication_key: `application-verify-${application.id}`,
    });
  }
  redirect("/membership/apply?application=received");
}

export async function unsubscribeMembershipNewsletter(formData: FormData) {
  const token = z.string().min(20).max(1000).parse(formData.get("token"));
  const email = emailFromNewsletterUnsubscribeToken(token);
  if (!email) redirect("/membership/newsletter/unsubscribe?result=invalid");
  const { error } = await createServiceClient().from("membership_email_suppressions").upsert({
    normalized_email: email,
    newsletter_suppressed: true,
    transactional_suppressed: false,
    reason: "The shared mailbox used the newsletter unsubscribe link.",
    updated_at: new Date().toISOString(),
  }, { onConflict: "normalized_email" });
  if (error) redirect("/membership/newsletter/unsubscribe?result=invalid");
  redirect("/membership/newsletter/unsubscribe?result=confirmed");
}

export async function confirmGuardianMembershipConsent(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = z.string().min(20).max(200).parse(formData.get("token"));
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("id,status,contact_email,payment_method,requested_plan_id,guardian_verification_expires_at,payment_settings_version_id")
    .eq("guardian_verification_token_hash", membershipTokenHash(token)).maybeSingle();
  if (!application || application.status !== "guardian_verification_pending"
    || !application.guardian_verification_expires_at
    || new Date(application.guardian_verification_expires_at) <= new Date()) {
    redirect("/membership/guardian-consent?consent=link-invalid");
  }
  const { data: plan } = await admin.from("membership_plans")
    .select("requires_approval").eq("id", application.requested_plan_id).maybeSingle();
  if (!plan) redirect("/membership/guardian-consent?consent=link-invalid");
  const nextStatus = plan.requires_approval ? "awaiting_approval"
    : application.payment_method === "stripe" ? "awaiting_payment"
      : application.payment_method === "bank_transfer" ? "awaiting_bank_transfer"
        : application.payment_method === "cheque" ? "awaiting_cheque" : "awaiting_cash";
  const paymentToken = membershipToken();
  const { error } = await admin.from("membership_applications").update({
    status: nextStatus,
    guardian_verified_at: new Date().toISOString(),
    guardian_verification_token_hash: null,
    guardian_verification_expires_at: null,
    verification_token_hash: membershipTokenHash(paymentToken),
    verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", application.id).eq("status", "guardian_verification_pending");
  if (error) redirect("/membership/guardian-consent?consent=link-invalid");
  // No extra applicant email is needed here. The guardian sees the successful
  // confirmation page and the applicant receives the officer's approval or
  // rejection email, which is the next actionable step.
  redirect("/membership/guardian-consent?consent=confirmed");
}

export async function continueApplicationCheckout(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = z.string().min(20).max(200).parse(formData.get("token"));
  const autoRenew = formData.get("auto_renew") === "on";
  const admin = createServiceClient();
  const { data } = await admin.from("membership_applications").select("id")
    .eq("verification_token_hash", membershipTokenHash(token))
    .eq("status", "awaiting_payment")
    .gt("verification_expires_at", new Date().toISOString()).maybeSingle();
  if (!data) redirect("/membership/apply?application=payment-link-invalid");
  await admin.from("membership_applications").update({ auto_renew: autoRenew, updated_at: new Date().toISOString() })
    .eq("id", data.id).eq("status", "awaiting_payment");
  let checkoutUrl: string;
  try {
    checkoutUrl = await createApplicationCheckoutFromToken(token);
  } catch (error) {
    redirect(error instanceof Error && error.name === "MembershipCheckoutUnavailableError"
      ? "/membership/apply?application=payment-unavailable"
      : "/membership/apply?application=payment-link-invalid");
  }
  redirect(checkoutUrl);
}

export async function resendMembershipVerification(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase()).safeParse(formData.get("contact_email"));
  if (!email.success) redirect("/membership/apply?application=verification-resent");
  if (!await verifyTurnstile(String(formData.get("captchaToken") || ""))) {
    redirect("/membership/apply?application=security-check");
  }
  if (!await consumeRateLimit("membership-verification-resend", 3, 60 * 60, email.data)) {
    redirect("/membership/apply?application=verification-resent");
  }
  const admin = createServiceClient();
  const { data: applications } = await admin.from("membership_applications")
    .select("id,status,contact_email,full_name,guardian_email")
    .ilike("contact_email", email.data)
    .in("status", ["email_verification_pending", "guardian_verification_pending"])
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(10);
  for (const application of applications ?? []) {
    const token = membershipToken();
    const guardian = application.status === "guardian_verification_pending";
    const expiresAt = new Date(Date.now() + (guardian ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("membership_applications").update(guardian ? {
      guardian_verification_token_hash: membershipTokenHash(token),
      guardian_verification_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    } : {
      verification_token_hash: membershipTokenHash(token),
      verification_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("id", application.id).eq("status", application.status);
    await admin.from("membership_notifications").update({ email_status: "cancelled", updated_at: new Date().toISOString() })
      .eq("application_id", application.id)
      .in("kind", ["membership.application-verify", "membership.guardian-verification"])
      .in("email_status", ["queued", "failed"]);
    const recipient = guardian ? application.guardian_email : application.contact_email;
    if (recipient) await admin.from("membership_notifications").insert({
      application_id: application.id,
      recipient_email: recipient,
      kind: guardian ? "membership.guardian-verification" : "membership.application-verify",
      title: guardian
        ? `Confirm ${application.full_name}'s Junior membership application`
        : `Verify ${application.full_name}'s membership application`,
      body: guardian
        ? `${application.full_name || "A junior applicant"} named you as their guardian. Confirm that you consent to this membership application.`
        : `Confirm your email address to continue ${application.full_name}'s Society membership application.`,
      action_href: guardian ? `/membership/guardian-consent?token=${encodeURIComponent(token)}` : `/membership/verify?token=${encodeURIComponent(token)}`,
      portal_visible: false,
      deduplication_key: `membership-verification-resend-${application.id}-${Date.now()}`,
    });
  }
  redirect("/membership/apply?application=verification-resent");
}

export async function reviewMembershipApplication(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("id,contact_email,full_name,payment_method,status,payment_settings_version_id")
    .eq("id", applicationId).eq("status", "awaiting_approval").maybeSingle();
  if (!application) redirect("/admin/memberships?error=application-unavailable");

  if (decision === "reject") {
    await admin.from("membership_applications").update({
      status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reason,
    }).eq("id", application.id);
    await admin.from("membership_notifications").insert({
      application_id: application.id, recipient_email: application.contact_email,
      kind: "membership.application-rejected", title: `${application.full_name}'s membership application update`,
      body: `${application.full_name}'s membership application was not approved. ${reason}`,
      portal_visible: false, deduplication_key: `application-rejected-${application.id}`,
    });
    redirect("/admin/memberships?notice=application-rejected");
  }

  const token = membershipToken();
  const nextStatus = application.payment_method === "stripe" ? "awaiting_payment"
    : application.payment_method === "bank_transfer" ? "awaiting_bank_transfer"
      : application.payment_method === "cheque" ? "awaiting_cheque" : "awaiting_cash";
  const { error } = await admin.from("membership_applications").update({
    status: nextStatus,
    verification_token_hash: membershipTokenHash(token),
    verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_reason: reason,
  }).eq("id", application.id);
  if (error) redirect("/admin/memberships?error=application-update-failed");
  const settings = await getMembershipPaymentSettings(application.payment_settings_version_id);
  const reference = membershipPaymentReference(application.id);
  const instructions = application.payment_method === "stripe" ? null
    : offlinePaymentInstructions(application.payment_method, settings, reference);
  await admin.from("membership_notifications").insert({
    application_id: application.id, recipient_email: application.contact_email,
    kind: "membership.application-approved", title: `${application.full_name}'s membership application is approved`,
    body: application.payment_method === "stripe"
      ? `${application.full_name}'s application is approved. Continue to secure online payment to activate membership.`
      : `${application.full_name}'s application is approved. ${instructions} Membership activates only after an officer confirms the complete payment.`,
    action_href: application.payment_method === "stripe" ? `/membership/checkout?token=${encodeURIComponent(token)}` : null,
    portal_visible: false, deduplication_key: `application-approved-${application.id}`,
  });
  redirect("/admin/memberships?notice=application-approved");
}

export async function recordOfflineApplicationPayment(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const event = z.enum(["received", "failed"]).parse(formData.get("event"));
  const reference = z.string().trim().max(120).optional().parse(formData.get("payment_reference") || undefined) ?? "";
  const receivedOn = z.iso.date().optional().parse(formData.get("received_on") || undefined) ?? null;
  const reason = z.string().trim().max(500).optional().parse(formData.get("reason") || undefined) ?? "";
  const admin = createServiceClient();
  if (receivedOn && receivedOn > londonToday()) redirect("/admin/memberships?error=future-payment-date");
  const { data: application } = await admin.from("membership_applications")
    .select("requested_plan_id,created_at").eq("id", applicationId).maybeSingle();
  if (!application) redirect("/admin/memberships?error=offline-payment-unavailable");
  try {
    const pricingDate = receivedOn ? new Date(`${receivedOn}T12:00:00Z`) : new Date();
    await ensureMembershipPlanPrice(application.requested_plan_id, membershipBillingYear(pricingDate));
  } catch {
    redirect("/admin/memberships?error=price-unavailable");
  }
  const { error } = await admin.rpc("record_offline_application_payment", {
    p_application_id: applicationId,
    p_event: event,
    p_payment_reference: reference,
    p_received_on: receivedOn,
    p_reason: reason,
    p_actor_id: user.id,
  });
  if (error) redirect("/admin/memberships?error=offline-payment-record-failed");
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?notice=offline-payment-${event}`);
}

export async function confirmOfflineMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const paymentMethod = z.enum(["cash", "bank_transfer", "cheque"]).parse(formData.get("payment_method"));
  const reference = z.string().trim().min(2).max(120).parse(formData.get("payment_reference"));
  const receivedOn = z.iso.date().parse(formData.get("received_on"));
  if (receivedOn > londonToday()) redirect("/admin/memberships?error=future-payment-date");
  if (paymentMethod === "cheque" && formData.get("cleared") !== "on") {
    redirect("/admin/memberships?error=cheque-clearance-required");
  }
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("requested_plan_id,status,payment_method")
    .eq("id", applicationId).maybeSingle();
  const expectedStatus = paymentMethod === "cash" ? "awaiting_cash"
    : paymentMethod === "bank_transfer" ? "awaiting_bank_transfer" : "awaiting_cheque";
  if (!application || application.payment_method !== paymentMethod || application.status !== expectedStatus) {
    redirect("/admin/memberships?error=offline-payment-unavailable");
  }
  const paymentDate = new Date(`${receivedOn}T12:00:00Z`);
  const year = membershipBillingYear(paymentDate);
  const price = await ensureMembershipPlanPrice(application.requested_plan_id, year).catch(() => null);
  if (!price) redirect("/admin/memberships?error=price-unavailable");
  const amount = proratedMembershipFee(price.amount_pence, paymentDate);
  const { data, error } = await admin.rpc("activate_offline_membership_application", {
    p_application_id: applicationId,
    p_plan_price_id: price.id,
    p_amount_pence: amount,
    p_actor_id: user.id,
    p_payment_reference: reference,
    p_received_on: receivedOn,
  });
  const memberId = data?.[0]?.member_id;
  if (error || !memberId) redirect("/admin/memberships?error=offline-payment-confirmation-failed");
  await ensureMemberPortalInvitation(memberId);
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=offline-payment-confirmed");
}

export async function createOfficerManagedMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const parsed = z.object({
    plan_id: z.string().uuid().optional(),
    title: z.string().trim().max(30).default(""),
    full_name: z.string().trim().min(2).max(180),
    date_of_birth: z.iso.date(),
    contact_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
    contact_number: z.string().trim().max(40).optional().transform((value) => value || null),
    payment_method: z.enum(["cash", "bank_transfer", "cheque"]),
    received_on: z.string().trim().max(10).optional().transform((value) => value ? z.iso.date().parse(value) : null),
    payment_reference: z.string().trim().max(120).optional().transform((value) => value || null),
    guardian_name: z.string().trim().max(180).optional().transform((value) => value || null),
    guardian_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
    guardian_consent_note: z.string().trim().max(500).optional().transform((value) => value || null),
    duplicate_override_reason: z.string().trim().max(500).optional().transform((value) => value || null),
    address_line_one: z.string().trim().max(180).optional().transform((value) => value || null),
    address_line_two: z.string().trim().max(180).optional().transform((value) => value || null),
    city: z.string().trim().max(100).optional().transform((value) => value || null),
    postcode: z.string().trim().max(20).optional().transform((value) => value || null),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/memberships?error=officer-member-details-invalid");
  const paymentReceived = formData.get("payment_received") === "on";
  if (paymentReceived && (!parsed.data.received_on || !parsed.data.payment_reference)) {
    redirect("/admin/memberships?error=offline-payment-evidence-required");
  }
  if (parsed.data.payment_method === "cheque" && paymentReceived && formData.get("cleared") !== "on") {
    redirect("/admin/memberships?error=cheque-clearance-required");
  }
  if (parsed.data.received_on && parsed.data.received_on > londonToday()) {
    redirect("/admin/memberships?error=future-payment-date");
  }
  const postalAddress = parsed.data.address_line_one || parsed.data.city || parsed.data.postcode ? {
    address_line_one: parsed.data.address_line_one,
    address_line_two: parsed.data.address_line_two,
    city: parsed.data.city,
    postcode: parsed.data.postcode,
    country: "United Kingdom",
  } : null;
  const membershipDate = parsed.data.received_on
    ? new Date(`${parsed.data.received_on}T12:00:00Z`)
    : new Date();
  const admin = createServiceClient();
  const { data: activePlans } = await admin.from("membership_plans")
    .select("id,slug,name,minimum_age,maximum_age,requires_approval,active")
    .eq("active", true);
  const eligible = eligibleMembershipPlans(activePlans ?? [], parsed.data.date_of_birth, membershipDate);
  const studentPlan = eligible.plans.find((plan) => plan.slug === "student") ?? null;
  const selectedPlan = formData.get("student_declaration") === "on"
    ? studentPlan
    : defaultMembershipPlan(eligible.plans);
  if (!selectedPlan) redirect("/admin/memberships?error=plan-age-mismatch");
  try {
    await ensureMembershipPlanPrice(selectedPlan.id, membershipBillingYear(membershipDate));
  } catch {
    redirect("/admin/memberships?error=price-unavailable");
  }
  const { data, error } = await admin.rpc("create_officer_managed_membership", {
    p_plan_id: selectedPlan.id,
    p_title: parsed.data.title,
    p_full_name: parsed.data.full_name,
    p_date_of_birth: parsed.data.date_of_birth,
    p_contact_email: parsed.data.contact_email,
    p_contact_number: parsed.data.contact_number,
    p_postal_address: postalAddress,
    p_payment_method: parsed.data.payment_method,
    p_payment_received: paymentReceived,
    p_payment_reference: parsed.data.payment_reference,
    p_received_on: parsed.data.received_on,
    p_student_declaration: formData.get("student_declaration") === "on",
    p_guardian_name: parsed.data.guardian_name,
    p_guardian_email: parsed.data.guardian_email,
    p_guardian_consent_note: parsed.data.guardian_consent_note,
    p_duplicate_override_reason: parsed.data.duplicate_override_reason,
    p_actor_id: user.id,
  });
  const memberId = data?.[0]?.member_id;
  if (error || !memberId) {
    const reason = error?.message.includes("membership_possible_duplicate") ? "possible-duplicate"
      : error?.message.includes("membership_guardian_consent_required") ? "guardian-consent-required"
        : error?.message.includes("membership_plan_age_mismatch") ? "plan-age-mismatch" : "officer-member-create-failed";
    redirect(`/admin/memberships?error=${reason}`);
  }
  if (paymentReceived && parsed.data.contact_email) await ensureMemberPortalInvitation(memberId);
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?member=${memberId}&notice=officer-member-created`);
}

export async function grantHonoraryMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const effectiveFrom = z.iso.date().parse(formData.get("effective_from"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: existingHonorary } = await admin.from("honorary_memberships").select("id").eq("member_id", memberId)
    .in("status", ["scheduled", "active"]).maybeSingle();
  if (existingHonorary) redirect("/admin/memberships?error=honorary-already-exists");
  const { data, error } = await admin.rpc("grant_lifetime_honorary_membership", {
    p_member_id: memberId, p_effective_from: effectiveFrom, p_reason: reason, p_actor_id: user.id,
  });
  if (error || !data) redirect("/admin/memberships?error=honorary-grant-failed");
  await processMembershipProviderCommands(memberId);
  if (effectiveFrom <= new Date().toISOString().slice(0, 10)) {
    await ensureMemberPortalInvitation(memberId);
  }
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=honorary-scheduled");
}

export async function createHonoraryMember(formData: FormData) {
  await requireCapability("memberships.manage");
  const fullName = z.string().trim().min(2).max(180).parse(formData.get("full_name"));
  const emailValue = String(formData.get("contact_email") || "").trim();
  const email = emailValue ? z.string().email().max(254).parse(emailValue).toLowerCase() : null;
  const contactNumber = z.string().trim().max(40).parse(String(formData.get("contact_number") || "")) || null;
  const { data, error } = await createServiceClient().from("members").insert({
    full_name: fullName, contact_email: email, contact_number: contactNumber,
    preferred_contact_method: email ? "email" : contactNumber ? "telephone" : "officer",
    effective_state: "active", source: "officer",
  }).select("id").single();
  if (error || !data) redirect("/admin/memberships?error=honorary-member-create-failed");
  const forwarded = new FormData();
  forwarded.set("member_id", data.id);
  forwarded.set("effective_from", String(formData.get("effective_from") || ""));
  forwarded.set("reason", String(formData.get("reason") || ""));
  return grantHonoraryMembership(forwarded);
}

export async function revokeHonoraryMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const honoraryId = idSchema.parse(formData.get("honorary_id"));
  const effectiveOn = z.iso.date().parse(formData.get("effective_on"));
  const replacementPlanId = idSchema.parse(formData.get("replacement_plan_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const { data, error } = await createServiceClient().rpc("revoke_lifetime_honorary_membership", {
    p_honorary_id: honoraryId, p_effective_on: effectiveOn,
    p_replacement_plan_id: replacementPlanId, p_reason: reason, p_actor_id: user.id,
  });
  if (error || !data) redirect("/admin/memberships?error=honorary-revoke-failed");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=honorary-transition-scheduled");
}

export async function toggleMembershipAutoRenew(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireUser();
  const enable = formData.get("enable") === "true";
  const admin = createServiceClient();
  const { data } = await admin.from("members")
    .select("id,full_name,membership_subscriptions(stripe_subscription_id)")
    .eq("auth_user_id", user.id).maybeSingle();
  const subscriptions = data?.membership_subscriptions as Array<{ stripe_subscription_id: string }> | null;
  const subscriptionId = subscriptions?.[0]?.stripe_subscription_id;
  if (!data || !subscriptionId) redirect("/account?error=no-subscription");
  if (enable) {
    const year = new Date().getUTCFullYear();
    const { data: offlineTerms } = await admin.from("membership_terms")
      .select("id,membership_payments(method,status)").eq("member_id", data.id)
      .gte("membership_year", year).eq("status", "paid");
    const hasOfflineTerm = (offlineTerms ?? []).some((term) => {
      const payments = term.membership_payments as Array<{ method: string; status: string }> | null;
      return payments?.some((payment) => payment.method !== "stripe" && payment.status === "paid");
    });
    if (hasOfflineTerm) redirect("/account?error=offline-renewal-locked");
  }
  const commandType = enable ? "resume_auto_renew" : "cancel_at_boundary";
  const commandKey = `member-auto-renew-${data.id}-${crypto.randomUUID()}`;
  const { error: commandError } = await admin.from("membership_provider_commands").insert({
    member_id: data.id,
    command_type: commandType,
    stripe_subscription_id: subscriptionId,
    payload: { cancel_at_period_end: !enable },
    idempotency_key: commandKey,
  });
  if (commandError) redirect("/account?error=renewal-update-failed");
  await processMembershipProviderCommands(data.id);
  const { data: command } = await admin.from("membership_provider_commands")
    .select("status").eq("idempotency_key", commandKey).maybeSingle();
  if (command?.status !== "complete") redirect("/account?error=renewal-update-pending");
  await admin.from("membership_notifications").insert({
    member_id: data.id, recipient_user_id: user.id, recipient_email: user.email,
    kind: "membership.auto-renew-changed", title: enable
      ? `${data.full_name}'s automatic renewal is enabled`
      : `${data.full_name}'s automatic renewal is switched off`,
    body: enable
      ? `${data.full_name}'s membership will renew automatically at the next annual renewal date.`
      : `${data.full_name}'s current paid membership remains active, but it will not charge automatically at the next renewal.`,
    action_href: "/account", deduplication_key: `auto-renew-${commandKey}`,
  });
  revalidatePath("/account");
  redirect("/account?notice=renewal-updated");
}

export async function openMembershipBillingPortal() {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireUser();
  redirect(await createMembershipPortal(user.id));
}

export async function startMembershipRenewalCheckout(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireUser();
  const autoRenew = formData.get("auto_renew") === "on";
  let checkoutUrl: string;
  try {
    checkoutUrl = await createMemberRenewalCheckout(user.id, autoRenew);
  } catch {
    redirect("/account?error=renewal-unavailable");
  }
  redirect(checkoutUrl);
}

export async function requestStudentMembership() {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  await requireUser();
  const year = new Date().getUTCFullYear() + 1;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("request_own_student_membership", { p_membership_year: year });
  if (error) redirect("/account?error=student-request-unavailable");
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/account?notice=student-request-sent");
}

export async function reviewStudentMembershipRequest(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const transitionId = idSchema.parse(formData.get("transition_id"));
  const approved = formData.get("decision") === "approve";
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const { error } = await createServiceClient().rpc("review_student_membership_request", {
    p_transition_id: transitionId,
    p_approved: approved,
    p_reason: reason,
    p_actor_id: user.id,
  });
  if (error) redirect("/admin/memberships?error=student-review-failed");
  await processMembershipProviderCommands(null, 20);
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=student-requests&notice=student-request-reviewed#student-requests");
}

export async function confirmExistingMemberOfflineRenewal(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const paymentMethod = z.enum(["cash", "bank_transfer", "cheque"]).parse(formData.get("payment_method"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear() + 1)
    .parse(formData.get("membership_year"));
  const reference = z.string().trim().min(2).max(120).parse(formData.get("payment_reference"));
  const receivedOn = z.iso.date().parse(formData.get("received_on"));
  if (receivedOn > londonToday()) redirect("/admin/memberships?error=future-payment-date");
  if (paymentMethod === "cheque" && formData.get("cleared") !== "on") {
    redirect("/admin/memberships?error=cheque-clearance-required");
  }
  const admin = createServiceClient();
  const { data: member } = await admin.from("members")
    .select("id,current_plan_id,effective_state,membership_subscriptions(stripe_subscription_id),honorary_memberships(status,effective_from,revoked_effective_on,replacement_plan_id)")
    .eq("id", memberId).maybeSingle();
  if (!member?.current_plan_id) redirect("/admin/memberships?error=offline-member-unavailable");
  const { data: transition } = await admin.from("membership_plan_transitions")
    .select("to_plan_id,status").eq("member_id", memberId).eq("membership_year", year)
    .in("status", ["scheduled", "approved", "awaiting_student_review"]).maybeSingle();
  if (transition?.status === "awaiting_student_review") redirect("/admin/memberships?error=student-request-pending");
  const honoraryRows = member.honorary_memberships as Array<{ status: string; effective_from: string; revoked_effective_on: string | null; replacement_plan_id: string | null }> | null;
  const honoraryTransition = member.effective_state === "honorary"
    ? honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.revoked_effective_on?.startsWith(`${year}-`) && item.replacement_plan_id) ?? null
    : null;
  const honoraryForYear = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
    && item.effective_from <= `${year}-12-31`
    && (!item.revoked_effective_on || item.revoked_effective_on > `${year}-01-01`)) ?? null;
  if (honoraryForYear && !honoraryTransition) redirect("/admin/memberships?error=honorary-year-no-payment");
  const price = await ensureMembershipPlanPrice(
    honoraryTransition?.replacement_plan_id ?? transition?.to_plan_id ?? member.current_plan_id,
    year,
  ).catch(() => null);
  if (!price) redirect("/admin/memberships?error=price-unavailable");
  const transitionDate = honoraryTransition?.revoked_effective_on
    ? new Date(`${honoraryTransition.revoked_effective_on}T12:00:00Z`) : null;
  const { data: pendingInitialTerm } = await admin.from("membership_terms")
    .select("plan_price_id,status,source,amount_due_pence,amount_paid_pence")
    .eq("member_id", memberId).eq("membership_year", year).maybeSingle();
  if (pendingInitialTerm?.status === "paid" && pendingInitialTerm.amount_paid_pence >= pendingInitialTerm.amount_due_pence) {
    redirect("/admin/memberships?error=membership-year-already-paid");
  }
  if (pendingInitialTerm?.status === "payment_review") redirect("/admin/memberships?error=payment-review-required");
  const completesInitialTerm = pendingInitialTerm?.plan_price_id === price.id
    && pendingInitialTerm.status === "scheduled"
    && pendingInitialTerm.amount_paid_pence === 0
    && ["officer", "application"].includes(pendingInitialTerm.source);
  const amount = completesInitialTerm ? pendingInitialTerm.amount_due_pence
    : transitionDate && (transitionDate.getUTCMonth() !== 0 || transitionDate.getUTCDate() !== 1)
      ? proratedMembershipFee(price.amount_pence, transitionDate) : price.amount_pence;
  const { error } = await admin.rpc("activate_offline_membership_renewal", {
    p_member_id: memberId,
    p_plan_price_id: price.id,
    p_membership_year: year,
    p_method: paymentMethod,
    p_amount_pence: amount,
    p_received_on: receivedOn,
    p_actor_id: user.id,
    p_payment_reference: reference,
  });
  if (error) redirect("/admin/memberships?error=offline-renewal-failed");
  await processMembershipProviderCommands(memberId);
  await ensureMemberPortalInvitation(memberId);
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=offline-renewal-confirmed");
}

export async function markMembershipNotificationRead(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  await requireUser();
  const notificationId = idSchema.parse(formData.get("notification_id"));
  await (await createServerClient()).rpc("mark_own_membership_notification_read", {
    p_notification_id: notificationId,
  });
  revalidatePath("/account");
}

export async function completeManualMembershipContact(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const notificationId = idSchema.parse(formData.get("notification_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: notification } = await admin.from("membership_notifications")
    .select("id,member_id").eq("id", notificationId).eq("kind", "membership.manual-contact-officer").is("read_at", null).maybeSingle();
  if (!notification?.member_id) redirect("/admin/memberships?error=manual-contact-unavailable");
  const { error } = await admin.from("membership_notifications").update({
    read_at: new Date().toISOString(), email_status: "cancelled", updated_at: new Date().toISOString(),
  }).eq("member_id", notification.member_id).eq("kind", "membership.manual-contact-officer").is("read_at", null);
  if (error) redirect("/admin/memberships?error=manual-contact-update-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.manual-contact-completed",
    entityType: "member", entityId: notification.member_id, summary: reason,
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=manual-contact-completed");
}

export async function retryMembershipNotification(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const notificationId = idSchema.parse(formData.get("notification_id"));
  const admin = createServiceClient();
  const { data: notification } = await admin.from("membership_notifications")
    .select("id,member_id,recipient_email,email_status,email_attempts")
    .eq("id", notificationId).maybeSingle();
  if (!notification?.recipient_email || !["failed", "sent"].includes(notification.email_status)) {
    redirect("/admin/memberships?error=email-retry-unavailable");
  }
  const { data: suppression } = await admin.from("membership_email_suppressions")
    .select("transactional_suppressed").eq("normalized_email", notification.recipient_email.toLowerCase()).maybeSingle();
  if (suppression?.transactional_suppressed) redirect("/admin/memberships?error=email-address-suppressed");
  const { error } = await admin.from("membership_notifications").update({
    email_status: "queued", email_attempts: 0, scheduled_for: new Date().toISOString(),
    last_email_error: null, provider_delivery_status: null, updated_at: new Date().toISOString(),
  }).eq("id", notification.id);
  if (error) redirect("/admin/memberships?error=email-retry-failed");
  await admin.rpc("request_membership_notification_delivery");
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.email-retried",
    entityType: "membership-notification", entityId: notification.id,
    before: { email_attempts: notification.email_attempts }, after: { email_attempts: 0 },
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=email-failures&notice=email-retry-requested#email-failures");
}

export async function requestMemberContactChange(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const role = z.enum(["self", "guardian", "shared_household"]).parse(formData.get("contact_role"));
  const emailValue = String(formData.get("contact_email") || "").trim().toLowerCase();
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("id,full_name,contact_email,contact_role")
    .eq("id", memberId).maybeSingle();
  if (!member) redirect("/admin/memberships?error=member-unavailable");
  const { data: actorId } = await admin.rpc("ensure_administrative_actor", { p_auth_user_id: user.id });
  if (!actorId) redirect("/admin/memberships?error=officer-history-unavailable");
  if (!emailValue) {
    await admin.from("membership_contact_change_requests").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("member_id", memberId).eq("contact_kind", "correspondence").eq("status", "pending");
    const { error } = await admin.from("members").update({
      contact_email: null, contact_email_verified_at: null, contact_role: role,
      portal_invitation_status: member.contact_email ? "not_requested" : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", memberId);
    if (error) redirect("/admin/memberships?error=contact-change-failed");
    await writeAudit({
      actorUserId: user.id, actorRole: "committee", action: "membership.contact-cleared",
      entityType: "member", entityId: memberId,
      before: { contact_email: member.contact_email, contact_role: member.contact_role },
      after: { contact_email: null, contact_role: role, reason },
    });
    revalidatePath("/admin/memberships");
    redirect(`/admin/memberships?member=${memberId}&section=member-history#member-history`);
  }
  const email = z.email().max(254).parse(emailValue);
  const token = membershipToken();
  await admin.from("membership_contact_change_requests").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("member_id", memberId).eq("contact_kind", "correspondence").eq("status", "pending");
  const { data: request, error } = await admin.from("membership_contact_change_requests").insert({
    member_id: memberId,
    contact_kind: "correspondence",
    requested_email: email,
    requested_role: role,
    token_hash: membershipTokenHash(token),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    requested_by: user.id,
    requested_by_actor_id: actorId,
    reason,
  }).select("id").single();
  if (error || !request) redirect("/admin/memberships?error=contact-change-failed");
  await admin.from("membership_notifications").insert({
    member_id: memberId, recipient_email: email,
    kind: "membership.contact-change-verification",
    title: `Confirm ${member.full_name}'s membership email`,
    body: `An officer requested this correspondence address for ${member.full_name}. Confirm it only if this mailbox should receive that member's essential membership messages.`,
    action_href: `/membership/contact-change?token=${encodeURIComponent(token)}`,
    portal_visible: false,
    deduplication_key: `membership-contact-change-${request.id}`,
  });
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?member=${memberId}&section=member-history&notice=contact-verification-sent#member-history`);
}

export async function requestOwnMembershipContactChange(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireUser();
  const email = z.email().max(254).parse(String(formData.get("contact_email") || "").trim().toLowerCase());
  const role = z.enum(["self", "shared_household"]).parse(formData.get("contact_role"));
  if (!await consumeRateLimit("membership-contact-change", 3, 24 * 60 * 60, user.id)) {
    redirect("/account?error=contact-change-rate-limited");
  }
  const admin = createServiceClient();
  const { data: member } = await admin.from("members")
    .select("id,full_name,contact_email,contact_role").eq("auth_user_id", user.id).maybeSingle();
  if (!member) redirect("/account?error=membership-unavailable");
  const token = membershipToken();
  await admin.from("membership_contact_change_requests").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("member_id", member.id).eq("contact_kind", "correspondence").eq("status", "pending");
  const { data: request, error } = await admin.from("membership_contact_change_requests").insert({
    member_id: member.id,
    contact_kind: "correspondence",
    requested_email: email,
    requested_role: role,
    token_hash: membershipTokenHash(token),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    requested_by: user.id,
    reason: "Member requested a correspondence email change from their personal portal.",
  }).select("id").single();
  if (error || !request) redirect("/account?error=contact-change-failed");
  const { error: noticeError } = await admin.from("membership_notifications").insert({
    member_id: member.id,
    recipient_email: email,
    kind: "membership.contact-change-verification",
    title: `Confirm ${member.full_name}'s membership email`,
    body: `Confirm this address only if it should receive ${member.full_name}'s essential membership messages. This does not change the website login email.`,
    action_href: `/membership/contact-change?token=${encodeURIComponent(token)}`,
    portal_visible: false,
    deduplication_key: `membership-contact-change-${request.id}`,
  });
  if (noticeError) redirect("/account?error=contact-change-failed");
  await admin.rpc("request_membership_notification_delivery");
  await writeAudit({
    actorUserId: user.id, actorRole: "member", action: "membership.contact-change-requested",
    entityType: "member", entityId: member.id,
    before: { contact_email: member.contact_email, contact_role: member.contact_role },
    after: { requested_email: email, contact_role: role },
  });
  redirect("/account?notice=contact-verification-sent");
}

export async function confirmMembershipContactChange(formData: FormData) {
  if (!membershipRecoveryEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = z.string().min(20).max(200).parse(formData.get("token"));
  const admin = createServiceClient();
  const { data: request } = await admin.from("membership_contact_change_requests")
    .select("id,member_id,requested_email,requested_role,status,expires_at")
    .eq("token_hash", membershipTokenHash(token)).maybeSingle();
  if (!request || request.status !== "pending" || new Date(request.expires_at) <= new Date()) {
    redirect("/membership/contact-change?result=invalid");
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("members").update({
    contact_email: request.requested_email,
    contact_email_verified_at: now,
    contact_role: request.requested_role || "self",
    updated_at: now,
  }).eq("id", request.member_id);
  if (error) redirect("/membership/contact-change?result=invalid");
  await admin.from("membership_contact_change_requests").update({ status: "confirmed", confirmed_at: now, updated_at: now })
    .eq("id", request.id).eq("status", "pending");
  await admin.from("membership_contact_change_requests").update({ status: "cancelled", updated_at: now })
    .eq("member_id", request.member_id).eq("status", "pending").neq("id", request.id);
  await writeAudit({
    actorUserId: null, actorRole: "system", action: "membership.contact-confirmed",
    entityType: "member", entityId: request.member_id,
    after: { requested_email: request.requested_email, contact_role: request.requested_role },
  });
  redirect("/membership/contact-change?result=confirmed");
}

export async function assignMemberPortalLogin(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const email = z.email().max(254).parse(String(formData.get("login_email") || "").trim().toLowerCase());
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("id,full_name,auth_user_id")
    .eq("id", memberId).maybeSingle();
  if (!member) redirect("/admin/memberships?error=member-unavailable");
  const { data: profile, error: profileError } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
  if (profileError) redirect("/admin/memberships?error=portal-login-check-failed");
  let authUserId = profile?.id ?? null;
  if (authUserId) {
    const { data: owner } = await admin.from("members").select("id").eq("auth_user_id", authUserId).neq("id", memberId).maybeSingle();
    if (owner) redirect("/admin/memberships?error=portal-login-in-use");
  } else {
    const { data: invitation, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: member.full_name, membership_active: true },
      redirectTo: `${getTrustedAppOrigin()}/auth/invite?next=/account`,
    });
    if (error || !invitation.user) redirect("/admin/memberships?error=portal-invitation-failed");
    authUserId = invitation.user.id;
  }
  const { error: linkError } = await admin.from("members").update({
    auth_user_id: authUserId,
    portal_invitation_status: profile ? "linked" : "sent",
    updated_at: new Date().toISOString(),
  }).eq("id", memberId);
  if (linkError) redirect("/admin/memberships?error=portal-link-failed");
  await admin.from("membership_notifications").update({
    recipient_user_id: authUserId, updated_at: new Date().toISOString(),
  }).eq("member_id", memberId).eq("portal_visible", true).is("recipient_user_id", null);
  if (profile) {
    const { error: noticeError } = await admin.from("membership_notifications").insert({
      member_id: memberId,
      recipient_user_id: authUserId,
      recipient_email: email,
      kind: "membership.portal-access-ready",
      title: `${member.full_name}'s personal membership account is ready`,
      body: `${member.full_name}'s membership has been linked to this individual website login. Open the account to view membership status, payments and notices.`,
      action_href: "/auth/switch-account?next=/account",
      portal_visible: true,
      deduplication_key: `membership-portal-access-ready-${memberId}-${authUserId}`,
    });
    if (noticeError && noticeError.code !== "23505") redirect("/admin/memberships?error=portal-notice-failed");
    await admin.rpc("request_membership_notification_delivery");
  } else {
    // The Supabase invitation is already the combined activation/account email.
    await admin.from("membership_notifications").update({ email_status: "cancelled", updated_at: new Date().toISOString() })
      .eq("member_id", memberId).eq("kind", "membership.activated").in("email_status", ["queued", "failed"]);
  }
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.portal-login-assigned",
    entityType: "member", entityId: memberId,
    before: { auth_user_id: member.auth_user_id }, after: { auth_user_id: authUserId, login_email: email, reason },
  });
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?member=${memberId}&section=member-history&notice=portal-login-assigned#member-history`);
}

export async function removeMemberPortalLogin(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("auth_user_id").eq("id", memberId).maybeSingle();
  if (!member?.auth_user_id) redirect("/admin/memberships?error=portal-login-unavailable");
  const { error } = await admin.from("members").update({
    auth_user_id: null, portal_invitation_status: "not_requested", updated_at: new Date().toISOString(),
  }).eq("id", memberId).eq("auth_user_id", member.auth_user_id);
  if (error) redirect("/admin/memberships?error=portal-login-remove-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.portal-login-removed",
    entityType: "member", entityId: memberId,
    before: { auth_user_id: member.auth_user_id }, after: { auth_user_id: null, reason },
  });
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?member=${memberId}&section=member-history&notice=portal-login-removed#member-history`);
}

export async function resolveMembershipPaymentReview(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const termId = idSchema.parse(formData.get("term_id"));
  const resolution = z.enum(["retain", "replace", "lapse"]).parse(formData.get("resolution"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const { error } = await createServiceClient().rpc("resolve_membership_payment_review", {
    p_term_id: termId, p_resolution: resolution, p_reason: reason, p_actor_id: user.id,
  });
  if (error) redirect("/admin/memberships?error=payment-review-resolution-failed");
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=payment-review-resolved");
}

export async function resolveMembershipMigrationReview(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const reviewId = idSchema.parse(formData.get("review_id"));
  const status = z.enum(["resolved", "dismissed"]).parse(formData.get("status"));
  const resolution = z.string().trim().min(8).max(500).parse(formData.get("resolution"));
  const admin = createServiceClient();
  const { data: review } = await admin.from("membership_migration_reviews")
    .select("id,review_kind,membership_record_id,status,review_group_key").eq("id", reviewId).maybeSingle();
  if (!review || review.status !== "pending") redirect("/admin/memberships?error=migration-review-unavailable");
  const { error } = await admin.from("membership_migration_reviews").update({
    status,
    resolution,
    resolved_by: user.id,
    resolved_at: new Date().toISOString(),
  }).eq("id", reviewId).eq("status", "pending");
  if (error) redirect("/admin/memberships?error=migration-review-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.migration-review-resolved",
    entityType: "membership-migration-review", entityId: reviewId,
    before: { status: review.status, review_kind: review.review_kind },
    after: { status, resolution, review_group_key: review.review_group_key },
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=membermojo-import&notice=migration-review-saved#membermojo-import");
}

export async function requestMembershipReportExport() {
  const { user } = await requireCapability("memberships.manage");
  const admin = createServiceClient();
  const { data: actorId } = await admin.rpc("ensure_administrative_actor", { p_auth_user_id: user.id });
  if (!actorId) redirect("/admin/memberships?error=report-unavailable");
  const { data: existing } = await admin.from("membership_report_exports").select("id")
    .eq("requested_by_actor_id", actorId).in("status", ["queued", "processing"]).limit(1).maybeSingle();
  if (existing) redirect("/admin/memberships?notice=report-already-running");
  const { data: report, error } = await admin.from("membership_report_exports").insert({
    requested_by_actor_id: actorId, filters: { scope: "complete-membership-register" }, status: "queued",
  }).select("id").single();
  if (error || !report) redirect("/admin/memberships?error=report-unavailable");
  const { error: requestError } = await admin.rpc("request_membership_report_generation");
  if (requestError) {
    await admin.from("membership_report_exports").update({ status: "failed", last_error: "Background report generation is not configured." }).eq("id", report.id);
    redirect("/admin/memberships?error=report-generation-unavailable");
  }
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.report-requested",
    entityType: "membership-report-export", entityId: report.id,
    after: { scope: "complete-membership-register" },
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=report-requested");
}

export async function reportOfflineMembershipPaymentFailure(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const paymentId = idSchema.parse(formData.get("payment_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const { error } = await createServiceClient().rpc("report_offline_membership_payment_failure", {
    p_payment_id: paymentId,
    p_reason: reason,
    p_actor_id: user.id,
  });
  if (error) redirect("/admin/memberships?error=offline-payment-review-failed");
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=offline-payment-review-created");
}

export async function resolveHonoraryPaymentConflict(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const decision = z.enum(["retain", "handled-in-stripe"]).parse(formData.get("decision"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { error } = await admin.from("membership_notifications").update({
    read_at: new Date().toISOString(), email_status: "cancelled", updated_at: new Date().toISOString(),
  }).eq("member_id", memberId)
    .in("kind", ["membership.honorary-payment-review", "membership.honorary-payment-review-officer"])
    .is("read_at", null);
  if (error) redirect("/admin/memberships?error=honorary-payment-review-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.honorary-payment-conflict-resolved",
    entityType: "member", entityId: memberId, summary: reason, after: { decision },
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=honorary-payment-review-resolved");
}

export async function correctMemberEligibility(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const dateOfBirth = z.iso.date().parse(formData.get("date_of_birth"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: before } = await admin.from("members").select("date_of_birth").eq("id", memberId).maybeSingle();
  if (!before) redirect("/admin/memberships?error=member-unavailable");
  const { error } = await admin.from("members").update({ date_of_birth: dateOfBirth, updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) redirect("/admin/memberships?error=eligibility-correction-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.eligibility-corrected",
    entityType: "member", entityId: memberId, summary: reason,
    before: { date_of_birth: before.date_of_birth }, after: { date_of_birth: dateOfBirth },
  });
  revalidatePath("/admin/memberships");
  redirect(`/admin/memberships?member=${memberId}&notice=eligibility-corrected`);
}

export async function saveMembershipPaymentSettings(formData: FormData) {
  if (!membershipAdministrationEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireRole(["administrator"]);
  const parsed = z.object({
    treasurer_name: z.string().trim().min(2).max(120),
    treasurer_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    treasurer_phone: z.string().trim().max(50).optional().transform((value) => value || null),
    bank_account_name: z.string().trim().min(2).max(120),
    bank_sort_code: z.string().trim().regex(/^[0-9]{2}-[0-9]{2}-[0-9]{2}$/),
    bank_account_number: z.string().trim().regex(/^[0-9]{8}$/),
    bank_transfer_instructions: z.string().trim().min(5).max(500),
    cheque_payee: z.string().trim().min(2).max(120),
    cheque_delivery_instructions: z.string().trim().min(5).max(500),
    cash_instructions: z.string().trim().min(5).max(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/settings?tab=membership&error=Check+the+Treasurer+and+payment+details.");
  const { error } = await createServiceClient().rpc("replace_membership_payment_settings", {
    p_actor_id: user.id,
    p_treasurer_name: parsed.data.treasurer_name,
    p_treasurer_email: parsed.data.treasurer_email,
    p_treasurer_phone: parsed.data.treasurer_phone,
    p_bank_account_name: parsed.data.bank_account_name,
    p_bank_sort_code: parsed.data.bank_sort_code,
    p_bank_account_number: parsed.data.bank_account_number,
    p_bank_transfer_instructions: parsed.data.bank_transfer_instructions,
    p_cheque_payee: parsed.data.cheque_payee,
    p_cheque_delivery_instructions: parsed.data.cheque_delivery_instructions,
    p_cash_instructions: parsed.data.cash_instructions,
  });
  if (error) redirect("/settings?tab=membership&error=Membership+payment+settings+could+not+be+saved.");
  revalidatePath("/membership/apply");
  revalidatePath("/settings");
  redirect("/settings?tab=membership&notice=membership-payment-settings-saved");
}

export async function updateMembershipPlan(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const planId = idSchema.parse(formData.get("plan_id"));
  const values = z.object({
    description: z.string().trim().min(2).max(500),
    minimum_age: z.coerce.number().int().min(0).max(120),
    maximum_age: z.coerce.number().int().min(0).max(120),
    active: z.string().optional().transform((value) => value === "on"),
    requires_approval: z.string().optional().transform((value) => value === "on"),
  }).parse(Object.fromEntries(formData));
  if (values.maximum_age < values.minimum_age) {
    redirect("/admin/memberships?section=plans&error=plan-age-range-invalid#plans");
  }
  const admin = createServiceClient();
  const { data: before } = await admin.from("membership_plans")
    .select("description,minimum_age,maximum_age,active,requires_approval").eq("id", planId).maybeSingle();
  if (!before) redirect("/admin/memberships?section=plans&error=plan-unavailable#plans");
  const { error } = await admin.from("membership_plans").update({ ...values, updated_at: new Date().toISOString() }).eq("id", planId);
  if (error) redirect("/admin/memberships?section=plans&error=plan-update-failed#plans");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.plan-updated",
    entityType: "membership-plan", entityId: planId, before, after: values,
  });
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=plans&notice=plan-updated#plans");
}

export async function configureMembershipPrice(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const planId = idSchema.parse(formData.get("plan_id"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(2200).parse(formData.get("membership_year"));
  const amountPence = Math.round(z.coerce.number().positive().max(10_000).parse(formData.get("amount")) * 100);
  const admin = createServiceClient();
  const { data: plan } = await admin.from("membership_plans")
    .select("id,name,stripe_product_id").eq("id", planId).maybeSingle();
  if (!plan) redirect("/admin/memberships?section=plans&error=plan-unavailable#plans");
  const { data: effectivePrice } = await admin.from("membership_plan_prices")
    .select("amount_pence,stripe_price_id")
    .eq("plan_id", plan.id)
    .eq("active", true)
    .lte("membership_year", year)
    .order("membership_year", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (effectivePrice?.amount_pence === amountPence && effectivePrice.stripe_price_id) {
    redirect("/admin/memberships?notice=price-unchanged&section=plans#plans");
  }
  const stripe = getStripe();
  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({ name: `${plan.name} membership`, metadata: { ydsme_integration: "memberships", membership_plan_id: plan.id } });
    productId = product.id;
    await admin.from("membership_plans").update({ stripe_product_id: productId, updated_at: new Date().toISOString() }).eq("id", plan.id);
  }
  const stripePrice = await stripe.prices.create({
    product: productId,
    currency: "gbp",
    unit_amount: amountPence,
    recurring: { interval: "year" },
    metadata: { ydsme_integration: "memberships", membership_plan_id: plan.id, membership_year: String(year) },
  });
  await admin.from("membership_plan_prices").update({ active: false })
    .eq("plan_id", plan.id).eq("membership_year", year).eq("active", true);
  const { data: latest } = await admin.from("membership_plan_prices").select("version")
    .eq("plan_id", plan.id).eq("membership_year", year).order("version", { ascending: false }).limit(1);
  const { error } = await admin.from("membership_plan_prices").insert({
    plan_id: plan.id, membership_year: year, version: (latest?.[0]?.version ?? 0) + 1,
    amount_pence: amountPence, currency: "gbp", stripe_price_id: stripePrice.id,
    active: true, created_by: user.id,
  });
  if (error) redirect("/admin/memberships?section=plans&error=price-save-failed#plans");
  await admin.from("membership_plan_prices").update({ active: false })
    .eq("plan_id", plan.id)
    .gt("membership_year", year)
    .not("carried_forward_from_id", "is", null)
    .eq("active", true);
  let offset = 0;
  const pageSize = 200;
  while (true) {
    const { data: affectedMembers, error: affectedError } = await admin.from("members")
      .select("id,full_name,auth_user_id,contact_email,membership_subscriptions(stripe_subscription_id,next_charge_at)")
      .eq("current_plan_id", plan.id).in("effective_state", ["active", "grace", "payment_review"])
      .order("id").range(offset, offset + pageSize - 1);
    if (affectedError) {
      redirect("/admin/memberships?section=plans&error=price-transition-queue-failed#plans");
    }
    for (const member of affectedMembers ?? []) {
      const subscriptions = member.membership_subscriptions as Array<{ stripe_subscription_id: string; next_charge_at: string | null }> | null;
      const subscriptionId = subscriptions?.[0]?.stripe_subscription_id;
      const nextChargeYear = subscriptions?.[0]?.next_charge_at
        ? new Date(subscriptions[0].next_charge_at).getUTCFullYear()
        : null;
      if (subscriptionId && nextChargeYear !== null && nextChargeYear >= year) {
        const targetPrice = await ensureMembershipPlanPrice(plan.id, nextChargeYear).catch(() => null);
        if (targetPrice?.stripe_price_id) {
          await admin.from("membership_provider_commands").upsert({
            member_id: member.id,
            command_type: "transition_price",
            stripe_subscription_id: subscriptionId,
            payload: { stripe_price_id: targetPrice.stripe_price_id, plan_price_id: targetPrice.id, membership_year: nextChargeYear },
            idempotency_key: `price-transition-${stripePrice.id}-${member.id}-${nextChargeYear}`,
          }, { onConflict: "idempotency_key", ignoreDuplicates: true });
        }
      }
      await admin.from("membership_notifications").upsert({
        member_id: member.id, recipient_user_id: member.auth_user_id, recipient_email: member.contact_email,
        kind: "membership.price-changed", title: `${member.full_name}'s forthcoming membership price`,
        body: `${member.full_name}, ${plan.name} membership for ${year} will be £${(amountPence / 100).toFixed(2)}. Existing paid terms are unchanged.`,
        action_href: member.auth_user_id ? "/account" : null,
        deduplication_key: `membership-price-change-${stripePrice.id}-${member.id}`,
      }, { onConflict: "deduplication_key", ignoreDuplicates: true });
    }
    if ((affectedMembers?.length ?? 0) < pageSize) break;
    offset += pageSize;
  }
  await processMembershipProviderCommands(null, 20);
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.price-published",
    entityType: "membership-plan", entityId: plan.id,
    after: { membership_year: year, amount_pence: amountPence, version: (latest?.[0]?.version ?? 0) + 1 },
  });
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=plans&notice=price-saved#plans");
}

export async function stageMemberMojoCutover() {
  const { user } = await requireCapability("memberships.manage");
  const { error } = await createServiceClient().rpc("execute_membermojo_final_membership_cutover", { p_actor_id: user.id });
  if (error) redirect("/admin/memberships?error=cutover-failed");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=cutover-staged");
}

export async function setMembershipOfficer(formData: FormData) {
  if (!membershipAdministrationEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user, role } = await requireRole(["administrator"]);
  const targetUserId = idSchema.parse(formData.get("user_id"));
  const enabled = formData.get("enabled") === "true";
  const admin = createServiceClient();
  const { data: target } = await admin.from("user_roles")
    .select("role").eq("user_id", targetUserId).maybeSingle();
  if (target?.role !== "committee") redirect("/admin/memberships?error=officer-unavailable");
  const { error } = enabled
    ? await admin.from("user_capabilities").upsert({ user_id: targetUserId, capability: "memberships.manage", granted_by: user.id })
    : await admin.from("user_capabilities").delete().eq("user_id", targetUserId).eq("capability", "memberships.manage");
  if (error) redirect("/admin/memberships?error=officer-update-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: enabled ? "membership.officer-granted" : "membership.officer-revoked",
    entityType: "member", entityId: targetUserId, after: { capability: "memberships.manage", enabled },
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=officer-updated");
}
