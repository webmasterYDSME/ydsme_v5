import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG } from "@/lib/cache-tags";
import { membershipCheckoutWindow, membershipCheckoutQuoteKey } from "@/lib/membership-checkout-policy";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import {
  ageOn,
  membershipBillingYear,
  membershipRenewalYear,
  proratedMembershipFee,
} from "@/lib/membership-rules";

export { ageOn, membershipBillingYear, membershipRenewalAt, proratedMembershipFee } from "@/lib/membership-rules";

export const MEMBERSHIP_TERMS_VERSION = "2026-09-17";
export const MEMBERSHIP_INTEGRATION_IDENTIFIER = "ydsme_membership_qnvrltac";

const membershipMoney = (pence: number) => new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
}).format(pence / 100);

function membershipCheckoutDisclosure(amount: number, year: number) {
  return `${membershipMoney(amount)} covers membership through 31 December ${year}. This is a one-time payment. No automatic renewal payment will be taken.`;
}

export type PublicMembershipPlan = {
  id: string;
  slug: "junior" | "student" | "adult" | "concession";
  name: string;
  description: string;
  minimum_age: number;
  maximum_age: number;
  requires_approval: boolean;
  membership_year: number;
  amount_pence: number;
  currency: "gbp";
};

export type MembershipPlanPrice = {
  id: string;
  plan_id: string;
  membership_year: number;
  version: number;
  amount_pence: number;
  currency: string;
  stripe_price_id: string | null;
  active: boolean;
  carried_forward_from_id: string | null;
};

export type MembershipAccount = {
  member: {
    id: string;
    full_name: string;
    contact_email: string | null;
    contact_role: string;
    effective_state: string;
    joined_on: string;
  };
  plan: { name: string; slug: string } | null;
  student_request: { available: boolean; status: string | null; membership_year: number };
  term: {
    membership_year: number;
    status: string;
    ends_on: string;
    grace_ends_on: string;
    amount_due_pence: number;
    amount_paid_pence: number;
  } | null;
  subscription: {
    status: string;
    cancel_at_period_end: boolean;
    next_charge_at: string | null;
    renewal_locked: boolean;
    renewal_amount_pence: number | null;
  } | null;
  honorary: {
    status: string;
    effective_from: string;
    revoked_effective_on: string | null;
    replacement_plan_id: string | null;
  } | null;
  history: Array<{
    id: string;
    membership_year: number;
    status: string;
    amount_due_pence: number;
    amount_paid_pence: number;
    payments: Array<{ id: string; method: string; status: string; amount_pence: number; refunded_pence: number; created_at: string }>;
  }>;
  honorary_history: Array<{ id: string; status: string; effective_from: string; revoked_effective_on: string | null }>;
};

export function membershipToken() {
  return randomBytes(32).toString("base64url");
}

export function membershipTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newsletterUnsubscribeToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const encoded = Buffer.from(normalized, "utf8").toString("base64url");
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RATE_LIMIT_SECRET;
  if (!secret) throw new Error("Newsletter unsubscribe links are not configured.");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function emailFromNewsletterUnsubscribeToken(token: string) {
  const [encoded, provided, extra] = token.split(".");
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RATE_LIMIT_SECRET;
  if (!secret || !encoded || !provided || extra) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let received: Buffer;
  try { received = Buffer.from(provided, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const email = Buffer.from(encoded, "base64url").toString("utf8").trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
  } catch { return null; }
}

/**
 * Return the price for a financial workflow, creating an immutable snapshot for
 * the requested membership year when the latest officer-set fee still applies.
 */
export async function ensureMembershipPlanPrice(planId: string, membershipYear: number) {
  const { data, error } = await createServiceClient().rpc("ensure_membership_plan_price", {
    p_plan_id: planId,
    p_membership_year: membershipYear,
  });
  const price = data?.[0] as MembershipPlanPrice | undefined;
  if (error || !price) throw new Error("No annual fee is available for this membership year.");
  return price;
}

async function getEffectiveMembershipPlanPrice(planId: string, membershipYear: number) {
  const { data, error } = await createServiceClient().from("membership_plan_prices")
    .select("id,plan_id,membership_year,version,amount_pence,currency,stripe_price_id,active,carried_forward_from_id")
    .eq("plan_id", planId)
    .eq("active", true)
    .lte("membership_year", membershipYear)
    .order("membership_year", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to resolve the annual membership fee.");
  return data as MembershipPlanPrice | null;
}

async function loadPublicMembershipPlans(): Promise<PublicMembershipPlan[]> {
  const { data, error } = await createServiceClient()
    .from("public_membership_plans")
    .select("id,slug,name,description,minimum_age,maximum_age,requires_approval,membership_year,amount_pence,currency")
    .order("minimum_age")
    .order("amount_pence");
  if (error) throw new Error("Unable to load membership plans.");
  return (data ?? []) as PublicMembershipPlan[];
}

export const getPublicMembershipPlans = unstable_cache(
  loadPublicMembershipPlans,
  ["public-membership-plans"],
  { tags: [PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG], revalidate: 300 },
);

export async function getOpenMembershipRenewalCampaign() {
  const { data, error } = await createServiceClient().from("membership_renewal_campaigns").select("membership_year").eq("open", true).order("membership_year", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Unable to read annual renewal availability.");
  return data;
}

export async function getMembershipAccount(userId: string): Promise<MembershipAccount | null> {
  const admin = createServiceClient();
  const { data: member, error } = await admin.from("members")
    .select("id,full_name,contact_email,contact_role,effective_state,joined_on,current_plan_id,date_of_birth")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to load membership details.");
  if (!member) return null;
  const renewalYearForAccount = membershipRenewalYear(new Date());
  const [{ data: plan }, { data: terms }, { data: subscription }, { data: honorary }, { data: transition }] = await Promise.all([
    member.current_plan_id
      ? admin.from("membership_plans").select("name,slug").eq("id", member.current_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("membership_terms")
      .select("id,membership_year,status,ends_on,grace_ends_on,amount_due_pence,amount_paid_pence,membership_payments(id,method,status,amount_pence,refunded_pence,created_at)")
      .eq("member_id", member.id).order("membership_year", { ascending: false }).limit(20),
    admin.from("membership_subscriptions")
      .select("status,cancel_at_period_end,next_charge_at")
      .eq("member_id", member.id).maybeSingle(),
    admin.from("honorary_memberships")
      .select("id,status,effective_from,revoked_effective_on,replacement_plan_id")
      .eq("member_id", member.id).order("effective_from", { ascending: false }).limit(20),
    admin.from("membership_plan_transitions").select("status,to_plan_id")
      .eq("member_id", member.id).eq("membership_year", renewalYearForAccount).maybeSingle(),
  ]);
  type RawTerm = MembershipAccount["term"] & {
    id: string;
    membership_payments?: Array<{ id: string; method: string; status: string; amount_pence: number; refunded_pence: number; created_at: string }>;
  };
  const rawTerms = (terms ?? []) as RawTerm[];
  const rawTerm = rawTerms[0];
  const renewalLocked = Boolean(rawTerm
    && rawTerm.membership_year >= new Date().getUTCFullYear()
    && rawTerm.membership_payments?.some((payment) => payment.method !== "stripe" && payment.status === "paid"));
  const renewalYear = subscription?.next_charge_at
    ? new Date(subscription.next_charge_at).getUTCFullYear()
    : new Date().getUTCFullYear() + 1;
  const renewalPricePlanId = transition && ["scheduled", "approved", "applied"].includes(transition.status)
    ? transition.to_plan_id : member.current_plan_id;
  const renewalPrice = subscription && renewalPricePlanId
    ? await getEffectiveMembershipPlanPrice(renewalPricePlanId, renewalYear)
    : null;
  const currentHonorary = (honorary ?? []).find((item) => ["scheduled", "active"].includes(item.status));
  return {
    member: {
      id: member.id,
      full_name: member.full_name,
      contact_email: member.contact_email,
      contact_role: member.contact_role,
      effective_state: member.effective_state,
      joined_on: member.joined_on,
    },
    plan: plan ? { name: plan.name, slug: plan.slug } : null,
    student_request: {
      available: new Date().getUTCMonth() === 10 && plan?.slug === "adult" && Boolean(member.date_of_birth)
        && ageOn(member.date_of_birth!, new Date(Date.UTC(renewalYearForAccount, 0, 1))) >= 18
        && ageOn(member.date_of_birth!, new Date(Date.UTC(renewalYearForAccount, 0, 1))) <= 24
        && !transition,
      status: transition?.status ?? null,
      membership_year: renewalYearForAccount,
    },
    term: rawTerm ? {
      membership_year: rawTerm.membership_year,
      status: rawTerm.status,
      ends_on: rawTerm.ends_on,
      grace_ends_on: rawTerm.grace_ends_on,
      amount_due_pence: rawTerm.amount_due_pence,
      amount_paid_pence: rawTerm.amount_paid_pence,
    } : null,
    subscription: subscription ? { ...subscription, renewal_locked: renewalLocked, renewal_amount_pence: renewalPrice?.amount_pence ?? null } : null,
    honorary: currentHonorary ?? null,
    history: rawTerms.map((term) => ({
      id: term.id,
      membership_year: term.membership_year,
      status: term.status,
      amount_due_pence: term.amount_due_pence,
      amount_paid_pence: term.amount_paid_pence,
      payments: term.membership_payments ?? [],
    })),
    honorary_history: (honorary ?? []) as MembershipAccount["honorary_history"],
  } as MembershipAccount;
}

type CheckoutApplication = {
  id: string;
  contact_email: string;
  full_name: string;
  auto_renew: boolean;
  created_at: string;
  requested_plan_id: string;
  status: string;
  date_of_birth: string;
  student_declaration: boolean;
};

type ReservedCheckoutAttempt = {
  attempt_id: string;
  stripe_checkout_session_id: string | null;
  attempt_status: string;
  attempt_created: boolean;
};

async function reserveCheckoutAttempt(input: {
  purpose: "application" | "renewal" | "honorary_transition";
  applicationId?: string;
  memberId?: string;
  membershipYear: number;
  planPriceId: string;
  amountPence: number;
  autoRenew: boolean;
}) {
  const admin = createServiceClient();
  let existingQuery = admin.from("membership_checkout_attempts")
    .select("id,status,membership_year,plan_price_id,amount_pence,auto_renew,stripe_checkout_session_id,expires_at")
    .in("status", input.applicationId ? ["creating", "open", "expired"] : ["creating", "open"])
    .eq("purpose", input.purpose);
  existingQuery = input.applicationId
    ? existingQuery.eq("application_id", input.applicationId)
    : existingQuery.eq("member_id", input.memberId!).eq("membership_year", input.membershipYear);
  const { data: existingAttempts, error: existingError } = await existingQuery;
  if (existingError) throw new Error("Unable to check previous membership payments.");
  for (const existing of existingAttempts ?? []) {
    const noLongerValid = existing.status === "expired" || existing.membership_year !== input.membershipYear || existing.plan_price_id !== input.planPriceId
      || existing.amount_pence !== input.amountPence
      || existing.auto_renew !== input.autoRenew
      || new Date(existing.expires_at) <= new Date();
    if (!noLongerValid) continue;
    if (existing.stripe_checkout_session_id) {
      const session = await getStripe().checkout.sessions.retrieve(existing.stripe_checkout_session_id);
      if (session.status === "complete") throw new Error("Your payment is being confirmed. Do not pay again.");
      if (session.status === "open") await getStripe().checkout.sessions.expire(session.id);
    }
    await admin.from("membership_checkout_attempts").update({
      status: "expired", updated_at: new Date().toISOString(),
    }).eq("id", existing.id).in("status", ["creating", "open"]);
  }
  const { data, error } = await admin.rpc("reserve_membership_checkout_attempt", {
    p_purpose: input.purpose,
    p_application_id: input.applicationId ?? null,
    p_member_id: input.memberId ?? null,
    p_membership_year: input.membershipYear,
    p_plan_price_id: input.planPriceId,
    p_amount_pence: input.amountPence,
    p_auto_renew: input.autoRenew,
  });
  const attempt = data?.[0] as ReservedCheckoutAttempt | undefined;
  if (error || !attempt) throw new Error("Unable to reserve a membership payment.");
  if (attempt.stripe_checkout_session_id) {
    const existing = await getStripe().checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
    if (existing.status === "complete") throw new Error("Your payment is being confirmed. Do not pay again.");
    if (existing.status === "open" && existing.url) return { attempt, existingUrl: existing.url };
    await admin.from("membership_checkout_attempts").update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", attempt.attempt_id).in("status", ["creating", "open"]);
    return reserveCheckoutAttempt(input);
  }
  if (!attempt.attempt_created) throw new Error("A membership payment page is already being prepared.");
  return { attempt, existingUrl: null };
}

async function attachCheckoutSession(attemptId: string, sessionId: string, expiresAt: number) {
  const { data, error } = await createServiceClient().rpc("attach_membership_checkout_session", {
    p_attempt_id: attemptId,
    p_stripe_checkout_session_id: sessionId,
    p_expires_at: new Date(expiresAt * 1000).toISOString(),
  });
  if (error || !data) throw new Error("Unable to save the secure membership payment page.");
}

export class MembershipCheckoutUnavailableError extends Error {
  constructor() {
    super("Online membership payment is temporarily unavailable.");
    this.name = "MembershipCheckoutUnavailableError";
  }
}

type ProviderCommand = {
  command_id: string;
  command_type: "cancel_at_boundary" | "resume_auto_renew" | "cancel_for_offline_payment" | "cancel_for_honorary" | "transition_price";
  stripe_subscription_id: string;
  payload: Record<string, unknown> | null;
  idempotency_key: string;
};

export async function processMembershipProviderCommands(memberId: string | null = null, limit = 20) {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("claim_membership_provider_commands", {
    p_member_id: memberId,
    p_limit: limit,
  });
  if (error) throw new Error("Unable to claim membership payment updates.");
  const commands = (data ?? []) as ProviderCommand[];
  for (const command of commands) {
    try {
      if (command.command_type === "transition_price") {
        const priceId = typeof command.payload?.stripe_price_id === "string"
          ? command.payload.stripe_price_id : null;
        if (!priceId) throw new Error("Price transition details are incomplete.");
        let itemId = typeof command.payload?.subscription_item_id === "string"
          ? command.payload.subscription_item_id : null;
        if (!itemId) {
          const subscription = await getStripe().subscriptions.retrieve(command.stripe_subscription_id);
          itemId = subscription.items.data.find((item) => item.price.recurring)?.id ?? null;
        }
        if (!itemId) throw new Error("The recurring membership item is unavailable.");
        await getStripe().subscriptions.update(command.stripe_subscription_id, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: "none",
        }, { idempotencyKey: command.idempotency_key });
      } else {
        const cancel = command.command_type !== "resume_auto_renew";
        await getStripe().subscriptions.update(command.stripe_subscription_id, {
          cancel_at_period_end: cancel,
        }, { idempotencyKey: command.idempotency_key });
      }
      await admin.rpc("complete_membership_provider_command", {
        p_command_id: command.command_id,
        p_succeeded: true,
        p_safe_error: null,
      });
    } catch {
      await admin.rpc("complete_membership_provider_command", {
        p_command_id: command.command_id,
        p_succeeded: false,
        p_safe_error: "The payment service update failed and will be retried.",
      });
    }
  }
  return commands.length;
}

async function recordApplicationCheckoutProblem(
  application: CheckoutApplication,
  planName: string | null,
  billingYear: number,
  reason: "configuration" | "provider",
  resumeHref: string | null,
) {
  const admin = createServiceClient();
  const applicantBody = `${application.full_name}'s application has been saved, but online payment is temporarily unavailable. No payment has been taken.${resumeHref ? " Use the secure link below to try again after the issue is fixed." : ""} A membership officer has been notified and will contact you if anything else is needed.`;
  await admin.from("membership_notifications").upsert({
    application_id: application.id,
    recipient_email: application.contact_email,
    kind: "membership.application-payment-unavailable",
    title: `${application.full_name}'s membership application has been saved`,
    body: applicantBody,
    action_href: resumeHref,
    portal_visible: false,
    deduplication_key: `membership-checkout-unavailable-${application.id}`,
  }, { onConflict: "deduplication_key", ignoreDuplicates: true });

  const [{ data: administrators }, { data: membershipOfficers }, { data: activeUsers }] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("role", "administrator"),
    admin.from("user_capabilities").select("user_id").eq("capability", "memberships.manage"),
    admin.from("users").select("id").eq("membership_status", "active"),
  ]);
  const activeUserIds = new Set((activeUsers ?? []).map((user) => user.id));
  const officerIds = new Set([
    ...(administrators ?? []).map((officer) => officer.user_id),
    ...(membershipOfficers ?? []).map((officer) => officer.user_id),
  ].filter((userId) => activeUserIds.has(userId)));
  const planLabel = planName || "membership";
  const isConfigurationProblem = reason === "configuration";
  const officerBody = isConfigurationProblem
    ? `${application.full_name}'s ${planLabel} application is saved but cannot continue because the ${billingYear} online payment fee is not fully set up. Set the annual fee, then ask the applicant to use their existing payment link.`
    : `${application.full_name}'s ${planLabel} application is saved, but the online payment service did not create a checkout page. Check the payment service and ask the applicant to use their existing payment link when it is available.`;
  if (officerIds.size) {
    await admin.from("membership_notifications").upsert([...officerIds].map((recipientUserId) => ({
      application_id: application.id,
      recipient_user_id: recipientUserId,
      kind: "membership.application-payment-attention-officer",
      title: isConfigurationProblem ? "Online payment setup needed" : "Online payment could not be started",
      body: officerBody,
      action_href: isConfigurationProblem
        ? "/admin/memberships/renewals"
        : "/admin/memberships?kind=problem",
      email_status: "cancelled",
      deduplication_key: `membership-checkout-${reason}-${application.id}-${recipientUserId}`,
    })), { onConflict: "deduplication_key", ignoreDuplicates: true });
  }
}

async function resolveApplicationCheckoutProblems(applicationId: string) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("membership_notifications").update({ email_status: "cancelled", updated_at: now })
      .eq("application_id", applicationId)
      .eq("kind", "membership.application-payment-unavailable")
      .in("email_status", ["queued", "failed"]),
    admin.from("membership_notifications").update({ read_at: now, updated_at: now })
      .eq("application_id", applicationId)
      .eq("kind", "membership.application-payment-attention-officer")
      .is("read_at", null),
  ]);
}

export async function createApplicationCheckout(applicationId: string, resumeHref: string | null = null, reviewedQuote?: string) {
  const admin = createServiceClient();
  const { data: application, error } = await admin.from("membership_applications")
    .select("id,contact_email,full_name,auto_renew,created_at,requested_plan_id,status,date_of_birth,student_declaration")
    .eq("id", applicationId).maybeSingle();
  if (error || !application || application.status !== "awaiting_payment") {
    throw new Error("This membership application is not ready for payment.");
  }

  const checkoutApplication = application as CheckoutApplication;
  const paymentDate = new Date();
  const billingYear = membershipBillingYear(paymentDate);
  const [{ data: plan }, price] = await Promise.all([
    admin.from("membership_plans")
      .select("id,name,slug,minimum_age,maximum_age,stripe_product_id")
      .eq("id", checkoutApplication.requested_plan_id).eq("active", true).maybeSingle(),
    ensureMembershipPlanPrice(checkoutApplication.requested_plan_id, billingYear).catch(() => null),
  ]);
  if (!plan?.stripe_product_id || !price) {
    await recordApplicationCheckoutProblem(checkoutApplication, plan?.name ?? null, billingYear, "configuration", resumeHref);
    throw new MembershipCheckoutUnavailableError();
  }

  if (!plan || plan.id !== checkoutApplication.requested_plan_id) {
    throw new Error("This membership type is no longer available.");
  }
  const paymentAge = ageOn(checkoutApplication.date_of_birth, paymentDate);
  if (paymentAge < plan.minimum_age || paymentAge > plan.maximum_age
    || (plan.slug === "student" && !checkoutApplication.student_declaration)) {
    await admin.from("membership_notifications").insert({
      application_id: checkoutApplication.id,
      kind: "membership.plan-reassignment-required",
      title: "Membership type needs reassignment",
      body: `${checkoutApplication.full_name}'s eligibility changed before payment. Choose the correct membership type before issuing another payment link.`,
      action_href: "/admin/memberships?kind=payment",
      email_status: "cancelled",
      deduplication_key: `membership-plan-reassignment-${checkoutApplication.id}-${paymentAge}`,
    });
    throw new Error("This membership type needs officer reassignment before payment.");
  }
  const initialAmount = proratedMembershipFee(price.amount_pence, paymentDate);
  if (reviewedQuote !== undefined && reviewedQuote !== membershipCheckoutQuoteKey(price.id, billingYear, initialAmount)) {
    const error = new Error("Review the updated membership price before payment.");
    error.name = "MembershipCheckoutRefreshRequired";
    throw error;
  }
  const window = membershipCheckoutWindow(paymentDate);
  if (window.paused) {
    const error = new Error("New checkouts reopen at midnight on 1 December.");
    error.name = "MembershipCheckoutRefreshRequired";
    throw error;
  }
  const reservation = await reserveCheckoutAttempt({
    purpose: "application",
    applicationId: checkoutApplication.id,
    membershipYear: billingYear,
    planPriceId: price.id,
    amountPence: initialAmount,
    autoRenew: false,
  });
  if (reservation.existingUrl) return reservation.existingUrl;
  const origin = getTrustedAppOrigin();
  let checkoutUrl: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER,
      mode: "payment",
      customer_creation: "always",
      customer_email: checkoutApplication.contact_email,
      ...(window.expiresAt ? { expires_at: window.expiresAt } : {}),
      client_reference_id: checkoutApplication.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: initialAmount,
            product: plan.stripe_product_id,
          },
        },
      ],
      custom_text: {
        submit: {
          message: membershipCheckoutDisclosure(initialAmount, billingYear),
        },
      },
      metadata: {
        ydsme_integration: "memberships",
        membership_application_id: checkoutApplication.id,
        membership_plan_price_id: price.id,
        membership_year: String(billingYear),
        membership_initial_amount_pence: String(initialAmount),
        membership_auto_renew: "false",
        membership_checkout_attempt_id: reservation.attempt.attempt_id,
      },
      success_url: `${origin}/membership/apply?application=payment-received`,
      cancel_url: `${origin}/membership/apply?application=payment-cancelled`,
    }, {
      idempotencyKey: `membership-payment-${reservation.attempt.attempt_id}`,
    });
    await attachCheckoutSession(reservation.attempt.attempt_id, session.id, session.expires_at);
    checkoutUrl = session.url;
  } catch (error) {
    console.error(
      "Membership Checkout Session creation failed",
      error instanceof Error ? error.name : "UnknownProviderError",
    );
    await admin.from("membership_checkout_attempts").update({
      status: "failed", last_error: "The payment provider did not create a checkout page.", updated_at: new Date().toISOString(),
    }).eq("id", reservation.attempt.attempt_id).eq("status", "creating");
    await recordApplicationCheckoutProblem(checkoutApplication, plan.name, billingYear, "provider", resumeHref);
    throw new MembershipCheckoutUnavailableError();
  }
  if (!checkoutUrl) {
    await recordApplicationCheckoutProblem(checkoutApplication, plan.name, billingYear, "provider", resumeHref);
    throw new MembershipCheckoutUnavailableError();
  }
  await resolveApplicationCheckoutProblems(checkoutApplication.id);
  return checkoutUrl;
}

export async function refreshMembershipApplicationPaymentLink(applicationId: string) {
  const token = membershipToken();
  const admin = createServiceClient();
  const { data, error } = await admin.from("membership_applications").update({ verification_token_hash: membershipTokenHash(token), verification_expires_at: new Date(Date.now()+7*86400000).toISOString() })
    .eq("id",applicationId).eq("status","awaiting_payment").select("id").maybeSingle();
  if (error) throw new Error("Unable to recover your saved application.");
  if (!data) return null;
  const href = `/membership/checkout?token=${token}`;
  const { error: noticeError } = await admin.from("membership_notifications").update({ action_href: href }).eq("application_id",applicationId)
    .eq("kind","membership.application-payment-reminder").in("email_status",["queued","failed"]);
  if (noticeError) throw new Error("Unable to update your payment reminder.");
  return href;
}

export async function createApplicationCheckoutFromToken(token: string, reviewedQuote?: string) {
  if (token.length < 20 || token.length > 200) throw new Error("Invalid membership link.");
  const hash = membershipTokenHash(token);
  const { data, error } = await createServiceClient().from("membership_applications")
    .select("id,status,verification_expires_at")
    .eq("verification_token_hash", hash).maybeSingle();
  if (error || !data || data.status !== "awaiting_payment" || new Date(data.verification_expires_at) <= new Date()) {
    throw new Error("This membership payment link is no longer valid.");
  }
  return createApplicationCheckout(data.id, `/membership/checkout?token=${encodeURIComponent(token)}`, reviewedQuote);
}

export async function getApplicationCheckoutSummaryFromToken(token: string) {
  if (token.length < 20 || token.length > 200) return null;
  const admin = createServiceClient();
  const { data, error } = await admin.from("membership_applications")
    .select("id,full_name,requested_plan_id,status,verification_expires_at,auto_renew,membership_plans(name,active)")
    .eq("verification_token_hash", membershipTokenHash(token)).maybeSingle();
  if (error || !data || data.status !== "awaiting_payment"
    || new Date(data.verification_expires_at) <= new Date()) return null;
  const plan = Array.isArray(data.membership_plans) ? data.membership_plans[0] : data.membership_plans;
  if (!plan?.active) return null;
  const paymentDate = new Date();
  const membershipYear = membershipBillingYear(paymentDate);
  const price = await ensureMembershipPlanPrice(data.requested_plan_id, membershipYear).catch(() => null);
  if (!price) return null;
  return {
    quoteKey: membershipCheckoutQuoteKey(price.id, membershipYear, proratedMembershipFee(price.amount_pence, paymentDate)),
    checkoutPaused: membershipCheckoutWindow(paymentDate).paused,
    applicationId: data.id,
    fullName: data.full_name,
    planName: plan.name,
    membershipYear,
    initialAmountPence: proratedMembershipFee(price.amount_pence, paymentDate),
    annualAmountPence: price.amount_pence,
    autoRenew: data.auto_renew,
  };
}

export async function createMembershipPortal(userId: string) {
  const { data, error } = await createServiceClient().from("members")
    .select("membership_subscriptions(stripe_customer_id)")
    .eq("auth_user_id", userId).maybeSingle();
  const subscriptions = data?.membership_subscriptions as Array<{ stripe_customer_id: string }> | null;
  const customerId = subscriptions?.[0]?.stripe_customer_id;
  if (error || !customerId) throw new Error("No Stripe billing account is available.");
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getTrustedAppOrigin()}/account`,
  });
  return session.url;
}

export async function createMemberRenewalCheckout(userId: string, autoRenew = false, memberId?: string, requestedYear?: number, returnPath = "/account") {
  if (autoRenew) throw new Error("Automatic renewal is no longer offered.");
  const admin = createServiceClient();
  const { data: member, error } = await admin.from("members")
    .select("id,full_name,contact_email,current_plan_id,effective_state,membership_subscriptions(stripe_customer_id,status),honorary_memberships(status,revoked_effective_on,replacement_plan_id)")
    .eq(memberId ? "id" : "auth_user_id", memberId ?? userId).maybeSingle();
  if (error || !member?.contact_email || !member.current_plan_id
    || ["suspended", "archived", "payment_review"].includes(member.effective_state)) {
    throw new Error("This membership is not available for online renewal.");
  }
  const honoraryRows = member.honorary_memberships as Array<{
    status: string; revoked_effective_on: string | null; replacement_plan_id: string | null;
  }> | null;
  const honoraryTransition = member.effective_state === "honorary"
    ? honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.revoked_effective_on && item.replacement_plan_id) ?? null
    : null;
  if (member.effective_state === "honorary" && !honoraryTransition) {
    throw new Error("Honorary membership has no payment or renewal.");
  }
  const campaignQuery = admin.from("membership_renewal_campaigns").select("membership_year").eq("open", true);
  const { data: campaign } = await (requestedYear ? campaignQuery.eq("membership_year", requestedYear) : campaignQuery)
    .order("membership_year", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) throw new Error("Renewals are not open for this year.");
  const transitionDate = honoraryTransition?.revoked_effective_on
    ? new Date(`${honoraryTransition.revoked_effective_on}T12:00:00Z`) : null;
  const membershipYear = requestedYear ?? transitionDate?.getUTCFullYear() ?? campaign.membership_year;
  if (!honoraryTransition) {
    const { error: ageChangeError } = await admin.rpc("ensure_membership_age_transition", { p_member_id: member.id, p_year: membershipYear });
    if (ageChangeError) throw new Error("This membership is not available for online renewal.");
  }
  const { data: transition } = honoraryTransition ? { data: null } : await admin.from("membership_plan_transitions")
    .select("to_plan_id,status").eq("member_id", member.id).eq("membership_year", membershipYear)
    .in("status", ["scheduled", "approved", "awaiting_student_review"]).maybeSingle();
  if (transition?.status === "awaiting_student_review") {
    throw new Error("The Student membership request must be decided before payment.");
  }
  const renewalPlanId = honoraryTransition?.replacement_plan_id ?? transition?.to_plan_id ?? member.current_plan_id;
  const [price, { data: term }, { data: plan }] = await Promise.all([
    ensureMembershipPlanPrice(renewalPlanId, membershipYear).catch(() => null),
    admin.from("membership_terms").select("status,amount_paid_pence")
      .eq("member_id", member.id).eq("membership_year", membershipYear).maybeSingle(),
    admin.from("membership_plans").select("name,stripe_product_id").eq("id", renewalPlanId).maybeSingle(),
  ]);
  if (term?.status === "paid" || (term?.amount_paid_pence ?? 0) > 0) {
    throw new Error("This membership term is already paid.");
  }
  if (!price || !plan?.stripe_product_id) {
    throw new Error("Online renewal is not configured for this membership tier.");
  }
  const amount = transitionDate && (transitionDate.getUTCMonth() !== 0 || transitionDate.getUTCDate() !== 1)
    ? proratedMembershipFee(price.amount_pence, transitionDate)
    : price.amount_pence;
  const subscriptions = member.membership_subscriptions as Array<{ stripe_customer_id: string; status: string }> | null;
  if (subscriptions?.[0] && !["canceled", "incomplete_expired"].includes(subscriptions[0].status)) {
    throw new Error("An existing automatic renewal must be managed instead of replaced.");
  }
  const customerId = subscriptions?.[0]?.stripe_customer_id;
  const reservation = await reserveCheckoutAttempt({
    purpose: honoraryTransition ? "honorary_transition" : "renewal", memberId: member.id, membershipYear,
    planPriceId: price.id, amountPence: amount, autoRenew: false,
  });
  if (reservation.existingUrl) return reservation.existingUrl;
  const session = await getStripe().checkout.sessions.create({
    integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER,
    mode: "payment",
    ...(customerId ? { customer: customerId } : { customer_creation: "always", customer_email: member.contact_email }),
    client_reference_id: member.id,
    line_items: [
      { quantity: 1, price_data: { currency: "gbp", unit_amount: amount, product: plan.stripe_product_id } },
    ],
    custom_text: {
      submit: {
        message: membershipCheckoutDisclosure(amount, membershipYear),
      },
    },
    metadata: {
      ydsme_integration: "memberships",
      membership_member_id: member.id,
      membership_plan_price_id: price.id,
      membership_year: String(membershipYear),
      membership_initial_amount_pence: String(amount),
      membership_auto_renew: "false",
      membership_checkout_attempt_id: reservation.attempt.attempt_id,
      ...(honoraryTransition?.revoked_effective_on
        ? { membership_honorary_transition_on: honoraryTransition.revoked_effective_on }
        : {}),
    },
    success_url: `${getTrustedAppOrigin()}${returnPath}${returnPath.includes("?") ? "&" : "?"}notice=payment-received`,
    cancel_url: `${getTrustedAppOrigin()}${returnPath}${returnPath.includes("?") ? "&" : "?"}error=payment-cancelled`,
  }, {
    idempotencyKey: `membership-payment-${reservation.attempt.attempt_id}`,
  });
  await attachCheckoutSession(reservation.attempt.attempt_id, session.id, session.expires_at);
  if (!session.url) throw new Error("Stripe Checkout did not return a secure payment URL.");
  return session.url;
}

// The two things a member may need to be told alongside "your membership is active" when no website login was created.
const PORTAL_EMAIL_ALREADY_USED = "There is no website login for this membership yet, because this email address is already used for another login. If you would like one, please give the membership officer a different email address.";
const NO_PORTAL_LOGIN_YET = "No website login has been set up for this membership. If the member gets their own email address later, please tell the membership officer.";

/**
 * Link an existing portal profile or send the first Supabase invitation after
 * payment/honorary activation. Safe to call repeatedly from webhook retries.
 */
export async function ensureMemberPortalInvitation(memberId: string) {
  const admin = createServiceClient();
  const { data: member, error: memberError } = await admin.from("members")
    .select("id,full_name,contact_email,contact_role,portal_invitation_status,auth_user_id")
    .eq("id", memberId).maybeSingle();
  if (memberError) throw new Error("Unable to prepare the member portal invitation.");
  if (!member) return;

  const requestDelivery = async () => {
    const { error } = await admin.rpc("request_membership_notification_delivery");
    if (error) console.error("Unable to request membership activation email delivery.", error.message);
  };

  const releaseActivationEmail = async (authUserId: string | null, actionHref: string | null, extraBody?: string) => {
    const { data: notices, error: noticeError } = await admin.from("membership_notifications")
      .select("id,body").eq("member_id", member.id).eq("kind", "membership.activated")
      .ilike("recipient_email", member.contact_email ?? "").in("email_status", ["cancelled", "failed"]);
    if (noticeError) throw new Error("Unable to prepare the membership activation email.");
    for (const notice of notices ?? []) {
      const { error } = await admin.from("membership_notifications").update({
        recipient_user_id: authUserId,
        portal_visible: Boolean(authUserId),
        action_href: actionHref,
        body: extraBody ? `${notice.body}\n\n${extraBody}` : notice.body,
        email_status: "queued",
        scheduled_for: new Date().toISOString(),
        last_email_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", notice.id);
      if (error) throw new Error("Unable to prepare the membership activation email.");
    }
    if (notices?.length) await requestDelivery();
  };

  const linkPortalNotices = async (authUserId: string, sendActivationEmail: boolean) => {
    const { error } = await admin.from("membership_notifications").update({
      recipient_user_id: authUserId,
      updated_at: new Date().toISOString(),
    }).eq("member_id", member.id)
      .eq("portal_visible", true)
      .is("recipient_user_id", null);
    if (error) throw new Error("Unable to link membership notifications to the portal account.");

    if (sendActivationEmail && member.contact_email) {
      await releaseActivationEmail(authUserId, "/auth/switch-account?next=/account");
    }
  };

  if (member.auth_user_id) {
    await linkPortalNotices(member.auth_user_id, true);
    return;
  }
  if (!member.contact_email) {
    await admin.from("members").update({ portal_invitation_status: "not_requested" }).eq("id", member.id);
    return;
  }
  if (member.contact_role === "guardian" || member.portal_invitation_status === "declined") {
    await admin.from("members").update({ portal_invitation_status: "not_requested" }).eq("id", member.id);
    await releaseActivationEmail(null, null, NO_PORTAL_LOGIN_YET);
    return;
  }

  const invitationSecret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!invitationSecret) throw new Error("Portal invitations are not configured.");
  const invitationClaim = createHmac("sha256", invitationSecret).update(`membership-invitation:${member.id}:${member.contact_email.toLowerCase()}`).digest("hex");
  const { data: ownsMailbox, error: claimError } = await admin.rpc("claim_membership_portal_email", { p_member_id: member.id });
  if (claimError) throw new Error("Unable to check portal email ownership.");
  const { data: profile, error: profileError } = await admin.from("users")
    .select("id").ilike("email", member.contact_email).maybeSingle();
  if (profileError) throw new Error("Unable to check the member portal account.");
  if (profile && ownsMailbox) {
    // Recover only an invitation signed by this server for this exact member.
    // An email match or editable name alone must never link an existing account.
    const { data: invited } = await admin.auth.admin.getUserById(profile.id);
    const provided = invited.user?.user_metadata?.membership_invitation_claim;
    if (typeof provided === "string" && /^[a-f0-9]{64}$/.test(provided)
      && timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(invitationClaim, "hex"))) {
      const { error: recoveryError } = await admin.from("members").update({ auth_user_id: profile.id, portal_invitation_status: "sent" }).eq("id", member.id).is("auth_user_id", null);
      if (recoveryError) throw new Error("Unable to recover the member portal invitation.");
      await linkPortalNotices(profile.id, true);
      return;
    }
  }
  if (profile || !ownsMailbox) {
    // An email match is only a correspondence signal. It is never sufficient
    // evidence that this Auth account belongs to this canonical member.
    await admin.from("members").update({ portal_invitation_status: "blocked_shared" }).eq("id", member.id);
    await releaseActivationEmail(null, null, PORTAL_EMAIL_ALREADY_USED);
    return;
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(member.contact_email, {
    data: { full_name: member.full_name, membership_active: true, membership_invitation_claim: invitationClaim },
    redirectTo: `${getTrustedAppOrigin()}/auth/invite?next=/account`,
  });
  if (error || !data.user) throw new Error("Unable to send the member portal invitation.");
  const { error: linkError } = await admin.from("members")
    .update({ auth_user_id: data.user.id, portal_invitation_status: "sent" })
    .eq("id", member.id)
    .is("auth_user_id", null);
  if (linkError) throw new Error("Unable to link the invited portal account.");
  await linkPortalNotices(data.user.id, false);

  // The account invitation is the member's actionable activation email. Keep
  // the activation notice in the portal without sending a second email.
  const { error: suppressionError } = await admin.from("membership_notifications").update({
    email_status: "cancelled",
    updated_at: new Date().toISOString(),
  }).eq("member_id", member.id)
    .eq("kind", "membership.activated")
    .eq("portal_visible", true)
    .in("email_status", ["queued", "failed"]);
  if (suppressionError) throw new Error("Unable to streamline the membership activation email.");
}
