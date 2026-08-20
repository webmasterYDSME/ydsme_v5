"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { membershipBillingEnabled } from "@/lib/features";
import {
  ageOn,
  createMemberRenewalCheckout,
  createMembershipPortal,
  ensureMemberPortalInvitation,
  membershipToken,
  membershipTokenHash,
  MEMBERSHIP_TERMS_VERSION,
} from "@/lib/membership";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { verifyTurnstile } from "@/lib/turnstile";

const idSchema = z.string().uuid();
const applicationSchema = z.object({
  plan_id: z.string().uuid(),
  title: z.string().trim().max(30).default(""),
  full_name: z.string().trim().min(2).max(180),
  contact_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  contact_number: z.string().trim().max(40).optional().transform((value) => value || null),
  date_of_birth: z.iso.date(),
  payment_method: z.enum(["stripe", "cash"]),
  auto_renew: z.string().optional().transform((value) => value === "on"),
  student_declaration: z.string().optional().transform((value) => value === "on"),
  guardian_name: z.string().trim().max(180).optional().transform((value) => value || null),
  guardian_email: z.string().trim().max(254).optional().transform((value) => value ? z.email().parse(value).toLowerCase() : null),
  guardian_consent: z.string().optional().transform((value) => value === "on"),
  terms: z.literal("on"),
});

export async function submitMembershipApplication(formData: FormData) {
  if (!membershipBillingEnabled()) redirect("/membership?application=unavailable");
  const parsed = applicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/membership?application=invalid");
  if (!await verifyTurnstile(String(formData.get("captchaToken") || ""))) {
    redirect("/membership?application=security-check");
  }
  if (!await consumeRateLimit("membership-application", 5, 60 * 60, parsed.data.contact_email)) {
    redirect("/membership?application=received");
  }

  const admin = createServiceClient();
  const { data: plan } = await admin.from("membership_plans")
    .select("id,slug,name,minimum_age,maximum_age,requires_approval,active")
    .eq("id", parsed.data.plan_id).maybeSingle();
  if (!plan?.active) redirect("/membership?application=invalid");
  const age = ageOn(parsed.data.date_of_birth);
  const junior = plan.slug === "junior";
  if (age < plan.minimum_age || age > plan.maximum_age
    || (plan.slug === "student" && !parsed.data.student_declaration)
    || (junior && (!parsed.data.guardian_name || !parsed.data.guardian_email || !parsed.data.guardian_consent))) {
    redirect("/membership?application=eligibility");
  }

  const [{ data: existingMember }, { data: existingApplication }] = await Promise.all([
    admin.from("members").select("id,auth_user_id,contact_email")
      .ilike("contact_email", parsed.data.contact_email).neq("effective_state", "archived").limit(1).maybeSingle(),
    admin.from("membership_applications").select("id")
      .ilike("contact_email", parsed.data.contact_email)
      .not("status", "in", "(converted,rejected,expired)").limit(1).maybeSingle(),
  ]);
  if (existingMember) {
    await admin.from("membership_notifications").insert({
      member_id: existingMember.id, recipient_user_id: existingMember.auth_user_id,
      recipient_email: existingMember.contact_email, kind: "membership.duplicate-application",
      title: "A membership application used your email address",
      body: "A new application was submitted with the email on your membership record. No duplicate membership or payment was created. Sign in to renew, or contact the membership officer if this was not you.",
      action_href: existingMember.auth_user_id ? "/account" : null, portal_visible: Boolean(existingMember.auth_user_id),
      deduplication_key: `duplicate-membership-application-${existingMember.id}-${new Date().toISOString().slice(0, 10)}`,
    });
    redirect("/membership?application=received");
  }
  if (existingApplication) redirect("/membership?application=received");

  const token = membershipToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: application, error } = await admin.from("membership_applications").insert({
    requested_plan_id: plan.id,
    title: parsed.data.title,
    full_name: parsed.data.full_name,
    contact_email: parsed.data.contact_email,
    contact_number: parsed.data.contact_number,
    date_of_birth: parsed.data.date_of_birth,
    payment_method: parsed.data.payment_method,
    auto_renew: parsed.data.payment_method === "stripe" && parsed.data.auto_renew,
    student_declaration: parsed.data.student_declaration,
    guardian_name: parsed.data.guardian_name,
    guardian_email: parsed.data.guardian_email,
    guardian_consent: parsed.data.guardian_consent,
    verification_token_hash: membershipTokenHash(token),
    verification_expires_at: expiresAt.toISOString(),
    terms_version: MEMBERSHIP_TERMS_VERSION,
    terms_accepted_at: now.toISOString(),
  }).select("id").single();

  // Keep the public response deliberately generic for both duplicate and new identities.
  if (!error && application) {
    await admin.from("membership_notifications").insert({
      application_id: application.id,
      recipient_email: parsed.data.contact_email,
      kind: "membership.application-verify",
      title: "Verify your membership application",
      body: `Confirm your email address to continue your ${plan.name} membership application.`,
      action_href: `/membership/verify?token=${encodeURIComponent(token)}`,
      portal_visible: false,
      deduplication_key: `application-verify-${application.id}`,
    });
  }
  redirect("/membership?application=received");
}

export async function reviewMembershipApplication(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("id,contact_email,payment_method,status")
    .eq("id", applicationId).eq("status", "awaiting_approval").maybeSingle();
  if (!application) redirect("/admin/memberships?error=application-unavailable");

  if (decision === "reject") {
    await admin.from("membership_applications").update({
      status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reason,
    }).eq("id", application.id);
    await admin.from("membership_notifications").insert({
      application_id: application.id, recipient_email: application.contact_email,
      kind: "membership.application-rejected", title: "Membership application update",
      body: `Your membership application was not approved. ${reason}`,
      portal_visible: false, deduplication_key: `application-rejected-${application.id}`,
    });
    redirect("/admin/memberships?notice=application-rejected");
  }

  const token = membershipToken();
  const nextStatus = application.payment_method === "stripe" ? "awaiting_payment" : "awaiting_cash";
  const { error } = await admin.from("membership_applications").update({
    status: nextStatus,
    verification_token_hash: membershipTokenHash(token),
    verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_reason: reason,
  }).eq("id", application.id);
  if (error) redirect("/admin/memberships?error=application-update-failed");
  await admin.from("membership_notifications").insert({
    application_id: application.id, recipient_email: application.contact_email,
    kind: "membership.application-approved", title: "Your membership application is approved",
    body: application.payment_method === "stripe"
      ? "Your application is approved. Continue to secure Stripe Checkout to activate membership."
      : "Your application is approved. A membership officer will activate it when the full cash payment is received.",
    action_href: application.payment_method === "stripe" ? `/membership/checkout?token=${encodeURIComponent(token)}` : null,
    portal_visible: false, deduplication_key: `application-approved-${application.id}`,
  });
  redirect("/admin/memberships?notice=application-approved");
}

export async function confirmCashMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const applicationId = idSchema.parse(formData.get("application_id"));
  const receipt = z.string().trim().min(2).max(120).parse(formData.get("receipt_reference"));
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("requested_plan_id,created_at,status")
    .eq("id", applicationId).eq("status", "awaiting_cash").maybeSingle();
  if (!application) redirect("/admin/memberships?error=cash-unavailable");
  const createdAt = new Date(application.created_at);
  const year = createdAt.getUTCFullYear() + (createdAt.getUTCMonth() === 11 ? 1 : 0);
  const { data: price } = await admin.from("membership_plan_prices")
    .select("id,amount_pence").eq("plan_id", application.requested_plan_id)
    .eq("membership_year", year).eq("active", true).maybeSingle();
  if (!price) redirect("/admin/memberships?error=price-unavailable");
  const amount = createdAt.getUTCMonth() === 11
    ? price.amount_pence
    : Math.round(price.amount_pence * (12 - createdAt.getUTCMonth()) / 12);
  const { data, error } = await admin.rpc("activate_membership_application", {
    p_application_id: applicationId,
    p_plan_price_id: price.id,
    p_method: "cash",
    p_amount_pence: amount,
    p_actor_id: user.id,
    p_cash_receipt_reference: receipt,
  });
  const memberId = data?.[0]?.member_id;
  if (error || !memberId) redirect("/admin/memberships?error=cash-confirmation-failed");
  await ensureMemberPortalInvitation(memberId);
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=cash-confirmed");
}

export async function grantHonoraryMembership(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const effectiveFrom = z.iso.date().parse(formData.get("effective_from"));
  const reason = z.string().trim().min(5).max(500).parse(formData.get("reason"));
  const admin = createServiceClient();
  const [{ data: subscription }, { data: existingHonorary }] = await Promise.all([
    admin.from("membership_subscriptions").select("stripe_subscription_id").eq("member_id", memberId).maybeSingle(),
    admin.from("honorary_memberships").select("id").eq("member_id", memberId)
      .in("status", ["scheduled", "active"]).maybeSingle(),
  ]);
  if (existingHonorary) redirect("/admin/memberships?error=honorary-already-exists");
  if (subscription?.stripe_subscription_id) {
    await getStripe().subscriptions.update(subscription.stripe_subscription_id, { cancel_at_period_end: true });
  }
  const { data, error } = await admin.rpc("grant_lifetime_honorary_membership", {
    p_member_id: memberId, p_effective_from: effectiveFrom, p_reason: reason, p_actor_id: user.id,
  });
  if (error || !data) redirect("/admin/memberships?error=honorary-grant-failed");
  if (effectiveFrom <= new Date().toISOString().slice(0, 10)) {
    await ensureMemberPortalInvitation(memberId);
  }
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=honorary-scheduled");
}

export async function createHonoraryMember(formData: FormData) {
  await requireCapability("memberships.manage");
  const fullName = z.string().trim().min(2).max(180).parse(formData.get("full_name"));
  const email = z.string().trim().email().max(254).parse(formData.get("contact_email")).toLowerCase();
  const { data, error } = await createServiceClient().from("members").insert({
    full_name: fullName, contact_email: email, effective_state: "active", source: "officer",
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
  if (!membershipBillingEnabled()) redirect("/account?error=membership-unavailable");
  const { user } = await requireUser();
  const enable = formData.get("enable") === "true";
  const admin = createServiceClient();
  const { data } = await admin.from("members")
    .select("id,membership_subscriptions(stripe_subscription_id)")
    .eq("auth_user_id", user.id).maybeSingle();
  const subscriptions = data?.membership_subscriptions as Array<{ stripe_subscription_id: string }> | null;
  const subscriptionId = subscriptions?.[0]?.stripe_subscription_id;
  if (!data || !subscriptionId) redirect("/account?error=no-subscription");
  if (enable) {
    const year = new Date().getUTCFullYear();
    const { data: cashTerms } = await admin.from("membership_terms")
      .select("id,membership_payments(method,status)").eq("member_id", data.id)
      .gte("membership_year", year).eq("status", "paid");
    const hasCashTerm = (cashTerms ?? []).some((term) => {
      const payments = term.membership_payments as Array<{ method: string; status: string }> | null;
      return payments?.some((payment) => payment.method === "cash" && payment.status === "paid");
    });
    if (hasCashTerm) redirect("/account?error=cash-renewal-locked");
  }
  const updated = await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: !enable });
  await admin.from("membership_subscriptions").update({
    cancel_at_period_end: updated.cancel_at_period_end,
    status: updated.status,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscriptionId);
  await admin.from("membership_notifications").insert({
    member_id: data.id, recipient_user_id: user.id, recipient_email: user.email,
    kind: "membership.auto-renew-changed", title: enable ? "Auto-renewal enabled" : "Auto-renewal switched off",
    body: enable
      ? "Your membership will renew automatically at the next annual renewal date."
      : "Your current paid membership remains active, but it will not charge automatically at the next renewal.",
    action_href: "/account", deduplication_key: `auto-renew-${subscriptionId}-${updated.cancel_at_period_end}-${Date.now()}`,
  });
  revalidatePath("/account");
  redirect("/account?notice=renewal-updated");
}

export async function openMembershipBillingPortal() {
  if (!membershipBillingEnabled()) redirect("/account?error=membership-unavailable");
  const { user } = await requireUser();
  redirect(await createMembershipPortal(user.id));
}

export async function startMembershipRenewalCheckout(formData: FormData) {
  if (!membershipBillingEnabled()) redirect("/account?error=membership-unavailable");
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

export async function confirmExistingMemberCashRenewal(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const memberId = idSchema.parse(formData.get("member_id"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear() + 1)
    .parse(formData.get("membership_year"));
  const receipt = z.string().trim().min(2).max(120).parse(formData.get("receipt_reference"));
  const admin = createServiceClient();
  const { data: member } = await admin.from("members")
    .select("id,current_plan_id,membership_subscriptions(stripe_subscription_id)")
    .eq("id", memberId).maybeSingle();
  if (!member?.current_plan_id) redirect("/admin/memberships?error=cash-member-unavailable");
  const { data: price } = await admin.from("membership_plan_prices")
    .select("id,amount_pence").eq("plan_id", member.current_plan_id)
    .eq("membership_year", year).eq("active", true).maybeSingle();
  if (!price) redirect("/admin/memberships?error=price-unavailable");
  const now = new Date();
  const amount = year > now.getUTCFullYear()
    ? price.amount_pence
    : Math.round(price.amount_pence * (12 - now.getUTCMonth()) / 12);
  const subscriptions = member.membership_subscriptions as Array<{ stripe_subscription_id: string }> | null;
  const subscriptionId = subscriptions?.[0]?.stripe_subscription_id;
  if (subscriptionId) await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  const { error } = await admin.rpc("activate_membership_renewal", {
    p_member_id: memberId,
    p_plan_price_id: price.id,
    p_membership_year: year,
    p_method: "cash",
    p_amount_pence: amount,
    p_paid_on: now.toISOString().slice(0, 10),
    p_actor_id: user.id,
    p_cash_receipt_reference: receipt,
  });
  if (error) redirect("/admin/memberships?error=cash-renewal-failed");
  revalidatePath("/account");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=cash-renewal-confirmed");
}

export async function markMembershipNotificationRead(formData: FormData) {
  const { user } = await requireUser();
  const notificationId = idSchema.parse(formData.get("notification_id"));
  await createServiceClient().from("membership_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId).eq("recipient_user_id", user.id);
  revalidatePath("/account");
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
  if (values.maximum_age < values.minimum_age) redirect("/admin/memberships?error=plan-age-range-invalid");
  const admin = createServiceClient();
  const { data: before } = await admin.from("membership_plans")
    .select("description,minimum_age,maximum_age,active,requires_approval").eq("id", planId).maybeSingle();
  if (!before) redirect("/admin/memberships?error=plan-unavailable");
  const { error } = await admin.from("membership_plans").update({ ...values, updated_at: new Date().toISOString() }).eq("id", planId);
  if (error) redirect("/admin/memberships?error=plan-update-failed");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.plan-updated",
    entityType: "membership-plan", entityId: planId, before, after: values,
  });
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=plan-updated");
}

export async function configureMembershipPrice(formData: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const planId = idSchema.parse(formData.get("plan_id"));
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(2200).parse(formData.get("membership_year"));
  const amountPence = Math.round(z.coerce.number().positive().max(10_000).parse(formData.get("amount")) * 100);
  const admin = createServiceClient();
  const { data: plan } = await admin.from("membership_plans")
    .select("id,name,stripe_product_id").eq("id", planId).maybeSingle();
  if (!plan) redirect("/admin/memberships?error=plan-unavailable");
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
  if (error) redirect("/admin/memberships?error=price-save-failed");
  const { data: affectedMembers } = await admin.from("members")
    .select("id,auth_user_id,contact_email,membership_subscriptions(stripe_subscription_id)")
    .eq("current_plan_id", plan.id).in("effective_state", ["active", "grace", "payment_review"])
    .limit(500);
  for (const member of affectedMembers ?? []) {
    const subscriptions = member.membership_subscriptions as Array<{ stripe_subscription_id: string }> | null;
    const subscriptionId = subscriptions?.[0]?.stripe_subscription_id;
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const recurringItem = subscription.items.data.find((item) => item.price.recurring);
        if (recurringItem) {
          await stripe.subscriptions.update(subscriptionId, {
            items: [{ id: recurringItem.id, price: stripePrice.id }],
            proration_behavior: "none",
          });
          await admin.from("membership_subscriptions").update({ stripe_price_id: stripePrice.id })
            .eq("stripe_subscription_id", subscriptionId);
        }
      } catch {
        await admin.from("membership_notifications").insert({
          member_id: member.id, recipient_user_id: user.id,
          kind: "membership.price-transition-failed", title: "Membership price transition needs attention",
          body: `The Stripe subscription for a ${plan.name} member could not be moved to the ${year} price. Review it before renewal.`,
          action_href: "/admin/memberships?queue=payment-review", email_status: "queued",
          deduplication_key: `membership-price-transition-failed-${stripePrice.id}-${member.id}`,
        });
      }
    }
    await admin.from("membership_notifications").insert({
      member_id: member.id, recipient_user_id: member.auth_user_id, recipient_email: member.contact_email,
      kind: "membership.price-changed", title: "Your forthcoming membership price",
      body: `${plan.name} membership for ${year} will be £${(amountPence / 100).toFixed(2)}. Existing paid terms are unchanged and no proration has been applied.`,
      action_href: "/account", deduplication_key: `membership-price-change-${stripePrice.id}-${member.id}`,
    });
  }
  await writeAudit({
    actorUserId: user.id, actorRole: "committee", action: "membership.price-published",
    entityType: "membership-plan", entityId: plan.id,
    after: { membership_year: year, amount_pence: amountPence, version: (latest?.[0]?.version ?? 0) + 1 },
  });
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=price-saved");
}

export async function stageMemberMojoCutover() {
  const { user } = await requireCapability("memberships.manage");
  const { error } = await createServiceClient().rpc("execute_membermojo_final_membership_cutover", { p_actor_id: user.id });
  if (error) redirect("/admin/memberships?error=cutover-failed");
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships?notice=cutover-staged");
}

export async function setMembershipOfficer(formData: FormData) {
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
