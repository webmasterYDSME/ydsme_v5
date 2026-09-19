"use server";

import { validMembershipPhone, membershipPhoneHint } from "@/lib/membership-phone";
import { capitaliseName, dateLabel } from "@/lib/membership-admin/format";
import { guardianConsentMethods, submittedValues, type HonoraryMemberState, type OfficerMemberState, type PossibleDuplicate } from "@/lib/membership-admin/officer-member";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireCapability, requireUser } from "@/lib/auth";
import {
  PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG,
  PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG,
} from "@/lib/cache-tags";
import { closeOpenMembershipCheckouts, refreshMembershipApplicationPaymentLink } from "@/lib/membership";
import { clearSignupVerification, getSignupVerification } from "@/lib/membership-signup-session";
import { normaliseAccountNumber, normaliseSortCode } from "@/lib/membership-admin/bank";
import { writeAudit } from "@/lib/audit";
import { likeLiteral } from "@/lib/like-literal";
import { assessAmountReceived } from "@/lib/membership-admin/amount";
import { MEMBER_REVIEW_KINDS } from "@/lib/membership-admin/review-notices";
import {
  MEMBERMOJO_MEMBERSHIP_URL,
  membershipAdministrationEnabled,
  membershipBillingEnabled,
  membershipRecoveryEnabled,
} from "@/lib/features";
import {
  ageOn,
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
  offlinePaymentInstructions,
  offlinePaymentReminder,
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
const postgrestLikeLiteral = likeLiteral;
const normalizeApplicationDate = (value: unknown) => {
  if (typeof value !== "string") return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value;
};
const applicationSchema = z.object({
  plan_id: z.string().uuid().optional(),
  title: z.string().trim().max(10).default(""),
  full_name: z.string().trim().min(2).max(180),
  contact_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
  contact_number: z.string().trim().max(40).optional().refine(validMembershipPhone, membershipPhoneHint).transform((value) => value || null),
  date_of_birth: z.iso.date(),
  payment_method: z.enum(["stripe", "cash", "bank_transfer", "cheque"]),
  auto_renew: z.string().optional().transform((value) => value === "on"),
  student_declaration: z.string().optional().transform((value) => value === "on"),
  guardian_name: z.string().trim().max(180).optional().transform((value) => value || null),
  guardian_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
  guardian_consent: z.string().optional().transform((value) => value === "on"),
  guardian_led: z.string().optional().transform((value) => value === "on"),
  newsletter_opt_in: z.string().optional().transform((value) => value === "on"),
  terms: z.literal("on"),
});

export async function submitMembershipApplication(formData: FormData) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const fields = Object.fromEntries(formData);
  const parsed = applicationSchema.safeParse({ ...fields, date_of_birth: normalizeApplicationDate(fields.date_of_birth) });
  if (!parsed.success) redirect("/membership/apply?application=invalid");
  const applicationEmail = parsed.data.guardian_led ? parsed.data.guardian_email : parsed.data.contact_email;
  const verified = await getSignupVerification();
  if (!verified || verified.email !== applicationEmail || verified.full_name !== normalizeIdentityName(parsed.data.full_name)) redirect("/membership/apply?application=verification-required");
  if (!applicationEmail) redirect("/membership/apply?application=invalid");
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
  if (junior && !parsed.data.guardian_led) redirect("/membership/apply?application=eligibility");
  if (parsed.data.guardian_led && !junior) redirect("/membership/apply?application=eligibility");
  if (junior && parsed.data.guardian_email === applicationEmail && !parsed.data.guardian_led) {
    redirect("/membership/apply?application=eligibility");
  }

  const escapedEmail = postgrestLikeLiteral(applicationEmail);
  const identityName = normalizeIdentityName(parsed.data.full_name);
  const [{ data: memberCandidates }, { data: applicationCandidates }] = await Promise.all([
    admin.from("members").select("id,auth_user_id,contact_email,full_name")
      .ilike("contact_email", escapedEmail),
    admin.from("membership_applications").select("id,status,full_name")
      .ilike("contact_email", escapedEmail)
      .not("status", "in", "(converted,expired)"),
  ]);
  const existingMember = memberCandidates?.find((candidate) => normalizeIdentityName(candidate.full_name) === identityName);
  const existingApplication = applicationCandidates?.find((candidate) => normalizeIdentityName(candidate.full_name) === identityName);
  if (existingMember) redirect("/membership/apply?application=already-member");
  if (existingApplication) {
    if (existingApplication.status === "rejected") redirect("/membership/apply?application=contact-officer");
    if (existingApplication.status === "awaiting_payment") {
      const href = await refreshMembershipApplicationPaymentLink(existingApplication.id);
      redirect(href ?? "/membership/apply?application=already-member");
    }
    redirect(`/membership/apply?application=awaiting-${existingApplication.status.replace("awaiting_", "").replaceAll("_", "-")}`);
  }
  const token = membershipToken();
  const statusToken = membershipToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const applicationExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const paymentSettings = await getMembershipPaymentSettings();
  if (parsed.data.payment_method === "bank_transfer" && !paymentSettings.configured) {
    redirect("/membership/apply?application=payment-method-unavailable");
  }
  const offlinePrice = parsed.data.payment_method === "stripe"
    ? null
    : await ensureMembershipPlanPrice(plan.id, membershipBillingYear(now)).catch(() => null);
  if (parsed.data.payment_method !== "stripe" && !offlinePrice) {
    redirect("/membership/apply?application=payment-method-unavailable");
  }
  const offlineAmountPence = offlinePrice ? proratedMembershipFee(offlinePrice.amount_pence, now) : null;
  const { data: application, error } = await admin.from("membership_applications").insert({
    requested_plan_id: plan.id,
    title: parsed.data.title,
    full_name: parsed.data.full_name,
    contact_email: applicationEmail,
    contact_number: parsed.data.contact_number,
    date_of_birth: parsed.data.date_of_birth,
    payment_method: parsed.data.payment_method,
    auto_renew: false,
    status: parsed.data.payment_method === "stripe" ? "awaiting_payment" : `awaiting_${parsed.data.payment_method}`,
    email_verified_at: verified.verified_at,
    guardian_verified_at: junior ? verified.verified_at : null,
    manual_verification: plan.requires_approval ? "pending" : "not_required",
    student_declaration: parsed.data.student_declaration,
    guardian_name: parsed.data.guardian_name,
    guardian_consent_version: junior ? "2026-09-17" : null,
    guardian_email: parsed.data.guardian_email,
    guardian_consent: parsed.data.guardian_consent,
    guardian_led: parsed.data.guardian_led,
    contact_role: parsed.data.guardian_led ? "guardian" : memberCandidates?.length || applicationCandidates?.length ? "shared_household" : "self",
    portal_invitation_status: parsed.data.guardian_led ? "not_requested" : "eligible",
    newsletter_opt_in: parsed.data.newsletter_opt_in,
    payment_settings_version_id: paymentSettings.id === "default" ? null : paymentSettings.id,
    verification_token_hash: membershipTokenHash(token),
    verification_expires_at: expiresAt.toISOString(),
    expires_at: applicationExpiresAt.toISOString(),
    application_status_token_hash: membershipTokenHash(statusToken),
    application_status_expires_at: applicationExpiresAt.toISOString(),
    terms_version: MEMBERSHIP_TERMS_VERSION,
    terms_accepted_at: now.toISOString(),
  }).select("id").single();

  if (error || !application) redirect(`/membership/apply?application=${error?.message.includes("membership_identity_already_exists") ? "contact-officer" : "save-failed"}`);
  await admin.from("membership_signup_sessions").update({ application_id: application.id }).eq("id", verified.id);
  await clearSignupVerification();
  if (parsed.data.payment_method === "stripe") {
    await admin.from("membership_notifications").insert({ application_id: application.id, recipient_email: applicationEmail,
      kind: "membership.application-payment-reminder", title: "Complete your membership payment",
      body: "Your verified application is saved. Pay to activate your membership.", action_href: `/membership/checkout?token=${token}`,
      scheduled_for: new Date(Date.now()+86400000).toISOString(), portal_visible: false, deduplication_key: `application-payment-reminder-${application.id}` });
    redirect(`/membership/checkout?token=${token}`);
  }
  await admin.from("membership_notifications").insert([
    { application_id: application.id, recipient_email: applicationEmail,
      kind: "membership.application-payment-instructions",
      title: parsed.data.payment_method === "bank_transfer" ? "Your membership bank transfer details"
        : parsed.data.payment_method === "cheque" ? "Your membership cheque payment details"
          : "Your membership cash payment details",
      body: offlinePaymentInstructions(parsed.data.payment_method, paymentSettings, {
        applicantName: parsed.data.full_name,
        amountPence: offlineAmountPence!,
      }),
      scheduled_for: now.toISOString(),
      portal_visible: false, deduplication_key: `application-payment-instructions-${application.id}` },
    { application_id: application.id, recipient_email: applicationEmail,
      kind: "membership.application-payment-reminder",
      title: `Reminder: complete ${parsed.data.full_name}’s Society membership payment`,
      body: offlinePaymentReminder(parsed.data.payment_method, paymentSettings, {
        applicantName: parsed.data.full_name,
        amountPence: offlineAmountPence!,
        applicationExpiresAt,
      }),
      scheduled_for: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      portal_visible: false, deduplication_key: `application-payment-reminder-${application.id}` },
  ]);
  redirect(`/membership/apply?application=awaiting-${parsed.data.payment_method.replaceAll("_", "-")}&token=${encodeURIComponent(statusToken)}`);
}

export async function unsubscribeMembershipNewsletter(formData: FormData) {
  const token = z.string().min(20).max(1000).parse(formData.get("token"));
  const email = emailFromNewsletterUnsubscribeToken(token);
  if (!email) redirect("/membership/newsletter/unsubscribe?result=invalid");
  // Unsubscribing from the newsletter must not undo a block placed because emails to this address bounced
  // or were reported, so an existing row only has its newsletter flag changed.
  const admin = createServiceClient();
  const { data: existing, error: lookupError } = await admin.from("membership_email_suppressions")
    .select("normalized_email").eq("normalized_email", email).maybeSingle();
  if (lookupError) redirect("/membership/newsletter/unsubscribe?result=invalid");
  const { error } = existing
    ? await admin.from("membership_email_suppressions")
      .update({ newsletter_suppressed: true, updated_at: new Date().toISOString() }).eq("normalized_email", email)
    : await admin.from("membership_email_suppressions").insert({
      normalized_email: email,
      newsletter_suppressed: true,
      transactional_suppressed: false,
      reason: "The shared mailbox used the newsletter unsubscribe link.",
      updated_at: new Date().toISOString(),
    });
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
  const admin = createServiceClient();
  const { data } = await admin.from("membership_applications").select("id")
    .eq("verification_token_hash", membershipTokenHash(token))
    .eq("status", "awaiting_payment")
    .gt("verification_expires_at", new Date().toISOString()).maybeSingle();
  if (!data) redirect("/membership/apply?application=payment-link-invalid");
  await admin.from("membership_applications").update({ auto_renew: false, updated_at: new Date().toISOString() })
    .eq("id", data.id).eq("status", "awaiting_payment");
  let checkoutUrl: string;
  try {
    checkoutUrl = await createApplicationCheckoutFromToken(token, String(formData.get("reviewed_quote") || ""));
  } catch (error) {
    if (error instanceof Error && error.name === "MembershipCheckoutRefreshRequired") redirect(`/membership/checkout?token=${encodeURIComponent(token)}&notice=review-updated-price`);
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
    .ilike("contact_email", likeLiteral(email.data))
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
    .select("id,contact_email,full_name,payment_method,status,payment_settings_version_id,requested_plan_id,created_at")
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
  const pricingDate = new Date(application.created_at);
  const price = application.payment_method === "stripe"
    ? null
    : await ensureMembershipPlanPrice(application.requested_plan_id, membershipBillingYear(pricingDate)).catch(() => null);
  if (application.payment_method !== "stripe" && !price) redirect("/admin/memberships?error=price-unavailable");
  const instructions = application.payment_method === "stripe" ? null
    : offlinePaymentInstructions(application.payment_method, settings, {
      applicantName: application.full_name,
      amountPence: proratedMembershipFee(price!.amount_pence, pricingDate),
    });
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

/** Closes an application that is waiting for cash, a bank transfer or a cheque and is not going ahead (for example a repeat application). The applicant is not emailed. */
export async function closeOfflineMembershipApplication(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data, error } = await admin.from("membership_applications")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reason })
    .eq("id", applicationId).in("status", ["awaiting_cash", "awaiting_bank_transfer", "awaiting_cheque"]).select("id").maybeSingle();
  if (error || !data) {
    if (error) console.error("Application could not be closed", error);
    redirect("/admin/memberships?error=application-unavailable");
  }
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.application-closed",
    entityType: "membership_application", entityId: applicationId, summary: reason,
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=application-closed");
}

export async function confirmOfflineMembership(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
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
  const received = assessAmountReceived(formData.get("amount_received"), formData.get("amount_note"), amount);
  if (received.kind === "invalid") redirect("/admin/memberships?error=amount-received-invalid");
  if (received.kind === "over-needs-note") redirect("/admin/memberships?error=amount-difference-note");
  if (received.kind === "short") {
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membership.payment-short-reported",
      entityType: "membership_application", entityId: applicationId,
      summary: `Officer received £${(received.receivedPence / 100).toFixed(2)} against a fee of £${(amount / 100).toFixed(2)} (${reference}). Nothing was recorded.`,
    });
    redirect("/admin/memberships?error=amount-short");
  }
  const { data, error } = await admin.rpc("activate_offline_membership_application", {
    p_application_id: applicationId,
    p_plan_price_id: price.id,
    p_amount_pence: amount,
    p_actor_id: user.id,
    p_payment_reference: reference,
    p_received_on: receivedOn,
  });
  const memberId = data?.[0]?.member_id;
  if (error || !memberId) {
    // The database says exactly why it refused; keep that in the server log and give the officer the plain reason.
    console.error("Offline membership could not be activated", error);
    const reason = error?.message ?? "";
    const code = reason.includes("membership_possible_duplicate") ? "offline-payment-duplicate"
      : reason.includes("membership_guardian_not_verified") ? "offline-payment-guardian"
      : reason.includes("membership_payment_amount_invalid") ? "offline-payment-amount"
      : reason.includes("membership_price_unavailable") ? "price-unavailable"
      : "offline-payment-confirmation-failed";
    redirect(`/admin/memberships?error=${code}`);
  }
  if (received.kind === "over") await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.payment-extra-received",
    entityType: "membership_application", entityId: applicationId,
    summary: `Received £${(received.receivedPence / 100).toFixed(2)} against a fee of £${(amount / 100).toFixed(2)} (${reference}); extra £${(received.extraPence / 100).toFixed(2)}: ${received.note}`,
  });
  await closeOpenMembershipCheckouts({ applicationId });
  await ensureMemberPortalInvitation(memberId);
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=offline-payment-confirmed");
}

export async function createOfficerManagedMembership(previous: OfficerMemberState, formData: FormData): Promise<OfficerMemberState> {
  const { user } = await requireCapability("memberships.manage");
  // A failed attempt returns the typed values to the open drawer instead of redirecting, so nothing has to be typed again.
  const fail = (error: string): OfficerMemberState => ({ error, attempt: previous.attempt + 1, values: submittedValues(formData), created: null });
  let parsed;
  try {
    parsed = z.object({
      plan_id: z.string().uuid().optional(),
      title: z.string().trim().max(10).default(""),
      full_name: z.string().trim().min(2).max(180).transform(capitaliseName),
      date_of_birth: z.iso.date(),
      contact_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
      contact_number: z.string().trim().max(40).optional().transform((value) => value || null),
      payment_method: z.enum(["cash", "bank_transfer", "cheque"]),
      received_on: z.string().trim().max(10).optional().transform((value) => value ? z.iso.date().parse(value) : null),
      payment_reference: z.string().trim().max(120).optional().transform((value) => value || null),
      guardian_name: z.string().trim().max(180).optional().transform((value) => value ? capitaliseName(value) : null),
      guardian_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
      guardian_consent_note: z.string().trim().max(500).optional().transform((value) => value || null),
      guardian_consent_method: z.enum(["paper_form", "in_person", "phone", "other"]).optional().catch(undefined),
      guardian_consent_detail: z.string().trim().max(300).optional().transform((value) => value || null),
      guardian_consent_on: z.string().trim().max(10).optional().transform((value) => value ? z.iso.date().parse(value) : null),
      newsletter_consent_source: z.enum(["paper_form", "in_person", "phone"]).optional().catch(undefined),
      newsletter_consent_given_on: z.string().trim().max(10).optional().transform((value) => value ? z.iso.date().parse(value) : null),
      duplicate_override_reason: z.string().trim().max(500).optional().transform((value) => value || null),
      address_line_one: z.string().trim().max(180).optional().transform((value) => value || null),
      address_line_two: z.string().trim().max(180).optional().transform((value) => value || null),
      city: z.string().trim().max(100).optional().transform((value) => value || null),
      postcode: z.string().trim().max(20).optional().transform((value) => value || null),
    }).safeParse(Object.fromEntries(formData));
  } catch {
    return fail("officer-member-details-invalid");
  }
  if (!parsed.success) return fail("officer-member-details-invalid");
  if (!validMembershipPhone(parsed.data.contact_number ?? undefined)) return fail("phone-invalid");
  const newsletter = formData.get("newsletter_opt_in") === "on";
  if (newsletter && !parsed.data.contact_email) return fail("newsletter-email-required");
  if (newsletter && !parsed.data.newsletter_consent_source) return fail("newsletter-consent-evidence-required");
  if (newsletter && parsed.data.newsletter_consent_given_on && parsed.data.newsletter_consent_given_on > londonToday()) {
    return fail("newsletter-consent-date-invalid");
  }
  // The guardian's consent is recorded as one plain sentence: how it was given, when, and any detail.
  const guardianConsentNote = parsed.data.guardian_consent_method
    ? [
      `${guardianConsentMethods[parsed.data.guardian_consent_method]}${parsed.data.guardian_consent_on ? ` on ${dateLabel(parsed.data.guardian_consent_on)}` : ""}`,
      parsed.data.guardian_consent_detail,
    ].filter(Boolean).join(". ")
    : parsed.data.guardian_consent_note;
  const paymentReceived = formData.get("payment_received") === "on";
  if (paymentReceived && (!parsed.data.received_on || !parsed.data.payment_reference)) {
    return fail("offline-payment-evidence-required");
  }
  if (parsed.data.payment_method === "cheque" && paymentReceived && formData.get("cleared") !== "on") {
    return fail("cheque-clearance-required");
  }
  if (parsed.data.received_on && parsed.data.received_on > londonToday()) {
    return fail("future-payment-date");
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
  if (!selectedPlan) return fail("plan-age-mismatch");
  try {
    await ensureMembershipPlanPrice(selectedPlan.id, membershipBillingYear(membershipDate));
  } catch {
    return fail("price-unavailable");
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
    p_guardian_consent_note: guardianConsentNote,
    p_duplicate_override_reason: parsed.data.duplicate_override_reason,
    p_newsletter_opt_in: newsletter,
    p_newsletter_consent_source: newsletter ? parsed.data.newsletter_consent_source : undefined,
    p_newsletter_consent_given_on: newsletter ? parsed.data.newsletter_consent_given_on ?? londonToday() : undefined,
    p_actor_id: user.id,
  });
  const memberId = data?.[0]?.member_id;
  if (error || !memberId) {
    const reason = error?.message.includes("membership_possible_duplicate") ? "possible-duplicate"
      : error?.message.includes("membership_guardian_consent_required") ? "guardian-consent-required"
        : error?.message.includes("membership_plan_age_mismatch") ? "plan-age-mismatch"
          : error?.message.includes("membership_price_unavailable") ? "price-unavailable"
            : error?.message.includes("membership_newsletter_email_required") ? "newsletter-email-required"
              : error?.message.includes("membership_newsletter_consent_evidence_required") ? "newsletter-consent-evidence-required"
                : error?.message.includes("membership_newsletter_consent_date_invalid") ? "newsletter-consent-date-invalid"
                  : "officer-member-create-failed";
    return fail(reason);
  }
  if (paymentReceived && parsed.data.contact_email) await ensureMemberPortalInvitation(memberId);
  const { data: term } = await admin.from("membership_terms").select("membership_year,amount_due_pence").eq("id", data![0].term_id).maybeSingle();
  // The whole membership area shows this person now: the register, the Inbox and the counts.
  revalidatePath("/admin/memberships", "layout");
  return {
    error: null,
    attempt: previous.attempt,
    values: {},
    created: {
      memberId,
      name: parsed.data.full_name,
      planName: selectedPlan.name,
      year: term?.membership_year ?? membershipBillingYear(membershipDate),
      amountPence: term?.amount_due_pence ?? 0,
      paid: paymentReceived,
      newsletter,
    },
  };
}

/**
 * People already on the register who may be the person being added: the same email address, the same
 * name and date of birth, or (only when asked, as a warning) just the same name.
 */
async function lookupPossibleDuplicates(name: string, dateOfBirth: string, email: string, includeNameOnly: boolean): Promise<PossibleDuplicate[]> {
  const admin = createServiceClient();
  const columns = "id,full_name,effective_state";
  const titleCased = name.replace(/\S+/g, (word) => word.charAt(0).toLocaleUpperCase("en-GB") + word.slice(1).toLocaleLowerCase("en-GB"));
  const [byEmail, byNameAndBirth, byName] = await Promise.all([
    email ? admin.from("members").select(columns).ilike("contact_email", postgrestLikeLiteral(email)).neq("effective_state", "archived").limit(5) : null,
    dateOfBirth ? admin.from("members").select(columns).eq("date_of_birth", dateOfBirth).neq("effective_state", "archived").limit(200) : null,
    // Exact spellings only, never a pattern: a name-only match is a best-effort warning.
    includeNameOnly && name ? admin.from("members").select(columns).in("full_name", [name, titleCased]).neq("effective_state", "archived").limit(10) : null,
  ]);
  const seen = new Set<string>();
  const matches: PossibleDuplicate[] = [];
  for (const [rows, matchedOn] of [[byEmail?.data, "email"], [byNameAndBirth?.data, "name and date of birth"], [byName?.data, "name"]] as const) {
    for (const row of rows ?? []) {
      if (seen.has(row.id)) continue;
      // Names are compared here, not with a database pattern, so nothing typed can act as a wildcard.
      if (matchedOn !== "email" && (!name || normalizeIdentityName(row.full_name) !== normalizeIdentityName(name))) continue;
      seen.add(row.id);
      matches.push({ id: row.id, name: row.full_name, state: row.effective_state, matchedOn });
    }
  }
  return matches;
}

/** Looks for people already on the register who may be the person being added, before the form is submitted. */
export async function findPossibleDuplicateMembers(input: { full_name: string; date_of_birth: string; contact_email: string; include_name_only?: boolean }): Promise<PossibleDuplicate[]> {
  await requireCapability("memberships.manage");
  const parsed = z.object({
    full_name: z.string().trim().min(2).max(180).catch(""),
    date_of_birth: z.iso.date().catch(""),
    contact_email: z.email().max(254).catch(""),
    include_name_only: z.boolean().catch(false),
  }).safeParse(input);
  if (!parsed.success) return [];
  const { full_name: name, date_of_birth: dateOfBirth, contact_email: email, include_name_only: includeNameOnly } = parsed.data;
  return lookupPossibleDuplicates(name, dateOfBirth, email, includeNameOnly);
}

/** What follows a granted honorary membership: provider commands and, when it has started, the portal invitation. */
async function finishHonoraryGrant(memberId: string, effectiveFrom: string) {
  await processMembershipProviderCommands(memberId);
  if (effectiveFrom <= new Date().toISOString().slice(0, 10)) {
    await ensureMemberPortalInvitation(memberId);
  }
}

export async function grantHonoraryMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const effectiveFrom = z.iso.date().parse(formData.get("effective_from"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: existingHonorary } = await admin.from("honorary_memberships").select("id").eq("member_id", memberId)
    .in("status", ["scheduled", "active"]).maybeSingle();
  // The officer is on this member's record, so results go back there.
  const record = `/admin/memberships?member=${memberId}`;
  if (existingHonorary) redirect(`${record}&error=honorary-already-exists`);
  const { data, error } = await admin.rpc("grant_lifetime_honorary_membership", {
    p_member_id: memberId, p_effective_from: effectiveFrom, p_reason: reason, p_actor_id: user.id,
  });
  if (error || !data) redirect(`${record}&error=honorary-grant-failed`);
  await finishHonoraryGrant(memberId, effectiveFrom);
  revalidatePath("/admin/memberships", "layout");
  redirect(`${record}&notice=honorary-scheduled`);
}

export async function createHonoraryMember(previous: HonoraryMemberState, formData: FormData): Promise<HonoraryMemberState> {
  const { user, role } = await requireCapability("memberships.manage");
  // A failed attempt goes back to the open drawer with what was typed, and nothing is left half-created.
  const fail = (error: string): HonoraryMemberState => ({ error, attempt: previous.attempt + 1, values: submittedValues(formData) });
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const fullName = z.string().min(2).max(180).transform(capitaliseName).safeParse(text("full_name"));
  const email = text("contact_email") ? z.email().max(254).safeParse(text("contact_email")) : null;
  const birth = text("date_of_birth") ? z.iso.date().safeParse(text("date_of_birth")) : null;
  const effectiveFrom = z.iso.date().safeParse(text("effective_from"));
  const reason = z.string().min(5).max(500).safeParse(text("reason"));
  if (!fullName.success || (email && !email.success) || (birth && (!birth.success || birth.data > londonToday())) || !effectiveFrom.success || !reason.success) {
    return fail("honorary-member-details-invalid");
  }
  if (!validMembershipPhone(text("contact_number"))) return fail("phone-invalid");
  const contactEmail = email?.success ? email.data.toLowerCase() : null;
  const contactNumber = text("contact_number") || null;
  const dateOfBirth = birth?.success ? birth.data : null;

  // The same rule as adding a regular member: the same email, or the same name and date of birth, needs a reason.
  const matches = await lookupPossibleDuplicates(fullName.data, dateOfBirth ?? "", contactEmail ?? "", false);
  const override = text("duplicate_override_reason").slice(0, 500);
  if (matches.length && override.length < 5) return fail("possible-duplicate");

  const admin = createServiceClient();
  const { data: member, error } = await admin.from("members").insert({
    full_name: fullName.data, contact_email: contactEmail, contact_number: contactNumber, date_of_birth: dateOfBirth,
    preferred_contact_method: contactEmail ? "email" : contactNumber ? "telephone" : "officer",
    effective_state: "active", source: "officer",
  }).select("id").single();
  if (error || !member) return fail("honorary-member-create-failed");

  let granted = false;
  try {
    const result = await admin.rpc("grant_lifetime_honorary_membership", {
      p_member_id: member.id, p_effective_from: effectiveFrom.data, p_reason: reason.data, p_actor_id: user.id,
    });
    granted = !result.error && Boolean(result.data);
  } catch {
    granted = false;
  }
  if (!granted) {
    // Take back the person just added so a failed grant does not leave a member with no membership.
    await admin.from("members").delete().eq("id", member.id);
    return fail("honorary-grant-failed");
  }
  if (matches.length) {
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membership.honorary-duplicate-override",
      entityType: "member", entityId: member.id, summary: override,
      after: { matched: matches.map((match) => ({ member_id: match.id, matched_on: match.matchedOn })) },
    });
  }
  await finishHonoraryGrant(member.id, effectiveFrom.data);
  revalidatePath("/admin/memberships", "layout");
  redirect("/admin/memberships?notice=honorary-scheduled");
}

export async function revokeHonoraryMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const honoraryId = idSchema.parse(formData.get("honorary_id"));
  const effectiveOn = z.iso.date().parse(formData.get("effective_on"));
  const replacementPlanId = idSchema.parse(formData.get("replacement_plan_id"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: honorary } = await admin.from("honorary_memberships").select("member_id").eq("id", honoraryId).maybeSingle();
  // The officer is on this member's record, so results go back there.
  const record = honorary?.member_id ? `/admin/memberships?member=${honorary.member_id}` : "/admin/memberships?";
  const { data, error } = await admin.rpc("revoke_lifetime_honorary_membership", {
    p_honorary_id: honoraryId, p_effective_on: effectiveOn,
    p_replacement_plan_id: replacementPlanId, p_reason: reason, p_actor_id: user.id,
  });
  if (error || !data) redirect(`${record}${honorary?.member_id ? "&" : ""}error=honorary-revoke-failed`);
  revalidatePath("/admin/memberships", "layout");
  redirect(`${record}${honorary?.member_id ? "&" : ""}notice=honorary-transition-scheduled`);
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
  const { user, role } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const paymentMethod = z.enum(["cash", "bank_transfer", "cheque"]).parse(formData.get("payment_method"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear() + 1)
    .parse(formData.get("membership_year"));
  // Results go back to where the officer started: the Renewals list, or else the member's own record.
  const back = formData.get("return_to") === "renewals" ? `/admin/memberships/renewals?year=${year}` : `/admin/memberships?member=${memberId}`;
  const reference = z.string().trim().min(2).max(120).parse(formData.get("payment_reference"));
  const receivedOn = z.iso.date().parse(formData.get("received_on"));
  if (receivedOn > londonToday()) redirect(`${back}&error=future-payment-date`);
  if (paymentMethod === "cheque" && formData.get("cleared") !== "on") {
    redirect(`${back}&error=cheque-clearance-required`);
  }
  const admin = createServiceClient();
  const { data: member } = await admin.from("members")
    .select("id,current_plan_id,effective_state,membership_subscriptions(stripe_subscription_id),honorary_memberships(status,effective_from,revoked_effective_on,replacement_plan_id)")
    .eq("id", memberId).maybeSingle();
  if (!member?.current_plan_id) redirect(`${back}&error=offline-member-unavailable`);
  // Record any age change first, so the amount follows it even before renewals are opened.
  const { error: ageChangeError } = await admin.rpc("ensure_membership_age_transition", { p_member_id: memberId, p_year: year });
  if (ageChangeError) redirect(`${back}&error=price-unavailable`);
  const { data: transition } = await admin.from("membership_plan_transitions")
    .select("to_plan_id,status").eq("member_id", memberId).eq("membership_year", year)
    .in("status", ["scheduled", "approved", "awaiting_student_review"]).maybeSingle();
  if (transition?.status === "awaiting_student_review") redirect(`${back}&error=student-request-pending`);
  const honoraryRows = member.honorary_memberships as Array<{ status: string; effective_from: string; revoked_effective_on: string | null; replacement_plan_id: string | null }> | null;
  const honoraryTransition = member.effective_state === "honorary"
    ? honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.revoked_effective_on?.startsWith(`${year}-`) && item.replacement_plan_id) ?? null
    : null;
  const honoraryForYear = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
    && item.effective_from <= `${year}-12-31`
    && (!item.revoked_effective_on || item.revoked_effective_on > `${year}-01-01`)) ?? null;
  if (honoraryForYear && !honoraryTransition) redirect(`${back}&error=honorary-year-no-payment`);
  const price = await ensureMembershipPlanPrice(
    honoraryTransition?.replacement_plan_id ?? transition?.to_plan_id ?? member.current_plan_id,
    year,
  ).catch(() => null);
  if (!price) redirect(`${back}&error=price-unavailable`);
  const transitionDate = honoraryTransition?.revoked_effective_on
    ? new Date(`${honoraryTransition.revoked_effective_on}T12:00:00Z`) : null;
  const { data: pendingInitialTerm } = await admin.from("membership_terms")
    .select("plan_price_id,status,source,amount_due_pence,amount_paid_pence")
    .eq("member_id", memberId).eq("membership_year", year).maybeSingle();
  if (pendingInitialTerm?.status === "paid" && pendingInitialTerm.amount_paid_pence >= pendingInitialTerm.amount_due_pence) {
    redirect(`${back}&error=membership-year-already-paid`);
  }
  if (pendingInitialTerm?.status === "payment_review") redirect(`${back}&error=payment-review-required`);
  const completesInitialTerm = pendingInitialTerm?.plan_price_id === price.id
    && pendingInitialTerm.status === "scheduled"
    && pendingInitialTerm.amount_paid_pence === 0
    && ["officer", "application"].includes(pendingInitialTerm.source);
  const amount = completesInitialTerm ? pendingInitialTerm.amount_due_pence
    : transitionDate && (transitionDate.getUTCMonth() !== 0 || transitionDate.getUTCDate() !== 1)
      ? proratedMembershipFee(price.amount_pence, transitionDate) : price.amount_pence;
  const received = assessAmountReceived(formData.get("amount_received"), formData.get("amount_note"), amount);
  if (received.kind === "invalid") redirect(`${back}&error=amount-received-invalid`);
  if (received.kind === "over-needs-note") redirect(`${back}&error=amount-difference-note`);
  if (received.kind === "short") {
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membership.payment-short-reported",
      entityType: "member", entityId: memberId,
      summary: `Officer received £${(received.receivedPence / 100).toFixed(2)} against a ${year} fee of £${(amount / 100).toFixed(2)} (${reference}). Nothing was recorded.`,
    });
    redirect(`${back}&error=amount-short`);
  }
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
  if (error) redirect(`${back}&error=offline-renewal-failed`);
  if (received.kind === "over") await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.payment-extra-received",
    entityType: "member", entityId: memberId,
    summary: `Received £${(received.receivedPence / 100).toFixed(2)} against a ${year} fee of £${(amount / 100).toFixed(2)} (${reference}); extra £${(received.extraPence / 100).toFixed(2)}: ${received.note}`,
  });
  await closeOpenMembershipCheckouts({ memberId, membershipYear: year });
  await processMembershipProviderCommands(memberId);
  await ensureMemberPortalInvitation(memberId);
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect(`${back}&notice=offline-renewal-confirmed`);
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

/** Clears a "needs review" notice (possible duplicate member, Junior turning adult) once an officer has dealt with it. */
export async function completeMembershipReviewNotice(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const notificationId = idSchema.parse(formData.get("notification_id"));
  const admin = createServiceClient();
  const { data: notification } = await admin.from("membership_notifications")
    .select("id,member_id,kind").eq("id", notificationId).in("kind", MEMBER_REVIEW_KINDS).is("read_at", null).maybeSingle();
  if (!notification?.member_id) redirect("/admin/memberships?error=review-notice-unavailable");
  const { error } = await admin.from("membership_notifications").update({
    read_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("member_id", notification.member_id).eq("kind", notification.kind).is("read_at", null);
  if (error) redirect("/admin/memberships?error=review-notice-unavailable");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.review-notice-completed",
    entityType: "member", entityId: notification.member_id, summary: "Officer marked a membership review notice as dealt with.",
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=review-notice-cleared");
}

/** Records that a refund owed after a denied membership was handed back by hand (usually cash). */
export async function recordDeniedMembershipRefund(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const note = z.string().trim().min(5).max(400).parse(formData.get("note"));
  const admin = createServiceClient();
  const { error } = await admin.rpc("record_denied_membership_refund", { p_application_id: applicationId, p_actor: user.id, p_note: note });
  if (error) {
    console.error("Membership refund could not be recorded", error);
    redirect("/admin/memberships?error=refund-unavailable");
  }
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=refund-recorded");
}

/** Clears a bounce, complaint or stopped-delivery entry from the Problems list once the officer has dealt with it. */
export async function resolveMembershipDeliveryProblem(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const eventId = idSchema.parse(formData.get("event_id"));
  const admin = createServiceClient();
  const { data, error } = await admin.from("membership_delivery_events")
    .update({ resolved_at: new Date().toISOString() }).eq("id", eventId).is("resolved_at", null).select("id").maybeSingle();
  if (error || !data) redirect("/admin/memberships?error=delivery-problem-unavailable");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.delivery-problem-resolved",
    entityType: "membership-delivery-event", entityId: eventId, summary: "Officer marked an email delivery problem as dealt with.",
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=delivery-problem-cleared");
}

/** Clears a card payment that could not be applied to a membership once the officer has matched it or refunded it. */
export async function resolveUnappliedMembershipPayment(formData: FormData) {
  const { user, role } = await requireCapability("memberships.manage");
  const attemptId = idSchema.parse(formData.get("attempt_id"));
  const admin = createServiceClient();
  const { data, error } = await admin.from("membership_checkout_attempts")
    .update({ resolved_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "payment_review").is("resolved_at", null)
    .select("id").maybeSingle();
  if (error || !data) redirect("/admin/memberships?error=unapplied-payment-unavailable");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.payment-not-applied-resolved",
    entityType: "membership_checkout_attempt", entityId: attemptId, summary: "Officer marked a card payment that could not be applied as dealt with.",
  });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=unapplied-payment-cleared");
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
  // The officer is on this member's record, so results go back there.
  const record = `/admin/memberships?member=${memberId}`;
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const role = z.enum(["self", "guardian", "shared_household"]).parse(formData.get("contact_role"));
  const emailValue = String(formData.get("contact_email") || "").trim().toLowerCase();
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("id,full_name,contact_email,contact_role")
    .eq("id", memberId).maybeSingle();
  if (!member) redirect(`${record}&error=member-unavailable`);
  const { data: actorId } = await admin.rpc("ensure_administrative_actor", { p_auth_user_id: user.id });
  if (!actorId) redirect(`${record}&error=officer-history-unavailable`);
  if (!emailValue) {
    await admin.from("membership_contact_change_requests").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("member_id", memberId).eq("contact_kind", "correspondence").eq("status", "pending");
    const { error } = await admin.from("members").update({
      contact_email: null, contact_email_verified_at: null, contact_role: role,
      portal_invitation_status: member.contact_email ? "not_requested" : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", memberId);
    if (error) redirect(`${record}&error=contact-change-failed`);
    await writeAudit({
      actorUserId: user.id, actorRole: "committee", action: "membership.contact-cleared",
      entityType: "member", entityId: memberId,
      before: { contact_email: member.contact_email, contact_role: member.contact_role },
      after: { contact_email: null, contact_role: role, reason },
    });
    revalidatePath("/admin/memberships");
    redirect(`${record}&notice=contact-cleared`);
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
  if (error || !request) redirect(`${record}&error=contact-change-failed`);
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
  redirect(`${record}&notice=contact-verification-sent`);
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
  // The officer is on this member's record, so results go back there.
  const record = `/admin/memberships?member=${memberId}`;
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const email = z.email().max(254).parse(String(formData.get("login_email") || "").trim().toLowerCase());
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("id,full_name,auth_user_id,date_of_birth")
    .eq("id", memberId).maybeSingle();
  if (!member) redirect(`${record}&error=member-unavailable`);
  // Under-18s never get a login of their own: their guardian receives their emails and uses the guardian's own account.
  if (member.date_of_birth && ageOn(member.date_of_birth) < 18) redirect(`${record}&error=portal-login-junior`);
  const { data: profile, error: profileError } = await admin.from("users").select("id").ilike("email", likeLiteral(email)).maybeSingle();
  if (profileError) redirect(`${record}&error=portal-login-check-failed`);
  let authUserId = profile?.id ?? null;
  if (authUserId) {
    const { data: owner } = await admin.from("members").select("id").eq("auth_user_id", authUserId).neq("id", memberId).maybeSingle();
    if (owner) redirect(`${record}&error=portal-login-in-use`);
  } else {
    const { data: invitation, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: member.full_name, membership_active: true },
      redirectTo: `${getTrustedAppOrigin()}/auth/invite?next=/account`,
    });
    if (error || !invitation.user) redirect(`${record}&error=portal-invitation-failed`);
    authUserId = invitation.user.id;
  }
  const { error: linkError } = await admin.from("members").update({
    auth_user_id: authUserId,
    portal_invitation_status: profile ? "linked" : "sent",
    updated_at: new Date().toISOString(),
  }).eq("id", memberId);
  if (linkError) redirect(`${record}&error=portal-link-failed`);
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
    if (noticeError && noticeError.code !== "23505") redirect(`${record}&error=portal-notice-failed`);
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
  redirect(`${record}&notice=portal-login-assigned`);
}

export async function removeMemberPortalLogin(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  // The officer is on this member's record, so results go back there.
  const record = `/admin/memberships?member=${memberId}`;
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: member } = await admin.from("members").select("auth_user_id").eq("id", memberId).maybeSingle();
  if (!member?.auth_user_id) redirect(`${record}&error=portal-login-unavailable`);
  const { error } = await admin.from("members").update({
    auth_user_id: null, portal_invitation_status: "not_requested", updated_at: new Date().toISOString(),
  }).eq("id", memberId).eq("auth_user_id", member.auth_user_id);
  if (error) redirect(`${record}&error=portal-login-remove-failed`);
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.portal-login-removed",
    entityType: "member", entityId: memberId,
    before: { auth_user_id: member.auth_user_id }, after: { auth_user_id: null, reason },
  });
  revalidatePath("/admin/memberships");
  redirect(`${record}&notice=portal-login-removed`);
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
  // The officer is on this member's record, so results go back there.
  const record = `/admin/memberships?member=${memberId}`;
  const dateOfBirth = z.iso.date().parse(formData.get("date_of_birth"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: before } = await admin.from("members").select("date_of_birth").eq("id", memberId).maybeSingle();
  if (!before) redirect(`${record}&error=member-unavailable`);
  const { error } = await admin.from("members").update({ date_of_birth: dateOfBirth, updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) redirect(`${record}&error=eligibility-correction-failed`);
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.eligibility-corrected",
    entityType: "member", entityId: memberId, summary: reason,
    before: { date_of_birth: before.date_of_birth }, after: { date_of_birth: dateOfBirth },
  });
  revalidatePath("/admin/memberships");
  redirect(`${record}&notice=eligibility-corrected`);
}

export async function saveMembershipPaymentSettings(formData: FormData) {
  if (!membershipAdministrationEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const { user } = await requireCapability("memberships.manage");
  const parsed = z.object({
    treasurer_name: z.string().trim().min(2).max(120),
    treasurer_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    treasurer_phone: z.string().trim().max(50).optional().transform((value) => value || null),
    bank_account_name: z.string().trim().min(2).max(120),
    // 123456 and 12 34 56 are accepted and saved as 12-34-56.
    bank_sort_code: z.string().transform((value) => normaliseSortCode(value) ?? value).pipe(z.string().regex(/^[0-9]{2}-[0-9]{2}-[0-9]{2}$/)),
    // 12345678 and 1234 5678 are accepted and saved as 12345678.
    bank_account_number: z.string().transform((value) => normaliseAccountNumber(value) ?? value).pipe(z.string().regex(/^[0-9]{8}$/)),
    bank_transfer_instructions: z.string().trim().min(5).max(500),
    cheque_payee: z.string().trim().min(2).max(120),
    cheque_delivery_instructions: z.string().trim().min(5).max(500),
    cash_instructions: z.string().trim().min(5).max(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const bad = (field: string) => parsed.error.issues.some((issue) => issue.path[0] === field);
    const code = bad("bank_sort_code") ? "payment-sort-code-invalid" : bad("bank_account_number") ? "payment-account-number-invalid" : "payment-details-invalid";
    redirect(`/admin/memberships?section=payment-settings&error=${code}`);
  }
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
  if (error) redirect("/admin/memberships?section=payment-settings&error=payment-details-save-failed");
  updateTag(PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG);
  revalidatePath("/membership/apply");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?section=payment-settings&notice=membership-payment-settings-saved");
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
    redirect("/admin/memberships/renewals?error=plan-age-range-invalid");
  }
  const admin = createServiceClient();
  const { data: before } = await admin.from("membership_plans")
    .select("description,minimum_age,maximum_age,active,requires_approval").eq("id", planId).maybeSingle();
  if (!before) redirect("/admin/memberships/renewals?error=plan-unavailable");
  const { error } = await admin.from("membership_plans").update({ ...values, updated_at: new Date().toISOString() }).eq("id", planId);
  if (error) redirect("/admin/memberships/renewals?error=plan-update-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.plan-updated",
    entityType: "membership-plan", entityId: planId, before, after: values,
  });
  updateTag(PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG);
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships/renewals?notice=plan-updated");
}

export async function configureMembershipPrice(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const planId = idSchema.parse(formData.get("plan_id"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(2200).parse(formData.get("membership_year"));
  const amountPence = Math.round(z.coerce.number().positive().max(10_000).parse(formData.get("amount")) * 100);
  const admin = createServiceClient();
  const { data: plan } = await admin.from("membership_plans")
    .select("id,name,stripe_product_id").eq("id", planId).maybeSingle();
  if (!plan) redirect("/admin/memberships/renewals?error=plan-unavailable");
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
    redirect("/admin/memberships/renewals?notice=price-unchanged");
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
  if (error) redirect("/admin/memberships/renewals?error=price-save-failed");
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
      redirect("/admin/memberships/renewals?error=price-transition-queue-failed");
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
  updateTag(PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG);
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships/renewals?notice=price-saved");
}

