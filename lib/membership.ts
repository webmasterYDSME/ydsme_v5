import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import {
  membershipBillingYear,
  membershipRenewalAt,
  proratedMembershipFee,
} from "@/lib/membership-rules";

export { ageOn, membershipBillingYear, membershipRenewalAt, proratedMembershipFee } from "@/lib/membership-rules";

export const MEMBERSHIP_TERMS_VERSION = "2026-08-20";
export const MEMBERSHIP_INTEGRATION_IDENTIFIER = "ydsme_membership_qnvrltac";

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

export type MembershipAccount = {
  member: {
    id: string;
    full_name: string;
    effective_state: string;
    joined_on: string;
  };
  plan: { name: string } | null;
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

export async function getPublicMembershipPlans(): Promise<PublicMembershipPlan[]> {
  const { data, error } = await createServiceClient()
    .from("public_membership_plans")
    .select("id,slug,name,description,minimum_age,maximum_age,requires_approval,membership_year,amount_pence,currency")
    .order("minimum_age")
    .order("amount_pence");
  if (error) throw new Error("Unable to load membership plans.");
  return (data ?? []) as PublicMembershipPlan[];
}

export async function getMembershipAccount(userId: string): Promise<MembershipAccount | null> {
  const admin = createServiceClient();
  const { data: member, error } = await admin.from("members")
    .select("id,full_name,effective_state,joined_on,current_plan_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to load membership details.");
  if (!member) return null;
  const [{ data: plan }, { data: terms }, { data: subscription }, { data: honorary }] = await Promise.all([
    member.current_plan_id
      ? admin.from("membership_plans").select("name").eq("id", member.current_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("membership_terms")
      .select("id,membership_year,status,ends_on,grace_ends_on,amount_due_pence,amount_paid_pence,membership_payments(id,method,status,amount_pence,refunded_pence,created_at)")
      .eq("member_id", member.id).order("membership_year", { ascending: false }).limit(20),
    admin.from("membership_subscriptions")
      .select("status,cancel_at_period_end,next_charge_at")
      .eq("member_id", member.id).maybeSingle(),
    admin.from("honorary_memberships")
      .select("id,status,effective_from,revoked_effective_on")
      .eq("member_id", member.id).order("effective_from", { ascending: false }).limit(20),
  ]);
  type RawTerm = MembershipAccount["term"] & {
    id: string;
    membership_payments?: Array<{ id: string; method: string; status: string; amount_pence: number; refunded_pence: number; created_at: string }>;
  };
  const rawTerms = (terms ?? []) as RawTerm[];
  const rawTerm = rawTerms[0];
  const renewalLocked = Boolean(rawTerm
    && rawTerm.membership_year >= new Date().getUTCFullYear()
    && rawTerm.membership_payments?.some((payment) => payment.method === "cash" && payment.status === "paid"));
  const renewalYear = subscription?.next_charge_at
    ? new Date(subscription.next_charge_at).getUTCFullYear()
    : new Date().getUTCFullYear() + 1;
  const { data: renewalPrice } = subscription && member.current_plan_id
    ? await admin.from("membership_plan_prices").select("amount_pence")
      .eq("plan_id", member.current_plan_id).eq("membership_year", renewalYear).eq("active", true).maybeSingle()
    : { data: null };
  const currentHonorary = (honorary ?? []).find((item) => ["scheduled", "active"].includes(item.status));
  return {
    member: {
      id: member.id,
      full_name: member.full_name,
      effective_state: member.effective_state,
      joined_on: member.joined_on,
    },
    plan: plan ? { name: plan.name } : null,
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
};

export async function createApplicationCheckout(applicationId: string) {
  const admin = createServiceClient();
  const { data: application, error } = await admin.from("membership_applications")
    .select("id,contact_email,full_name,auto_renew,created_at,requested_plan_id,status")
    .eq("id", applicationId).maybeSingle();
  if (error || !application || application.status !== "awaiting_payment") {
    throw new Error("This membership application is not ready for payment.");
  }

  const checkoutApplication = application as CheckoutApplication;
  const createdAt = new Date(checkoutApplication.created_at);
  const billingYear = membershipBillingYear(createdAt);
  const [{ data: plan }, { data: price }] = await Promise.all([
    admin.from("membership_plans")
      .select("id,name,stripe_product_id")
      .eq("id", checkoutApplication.requested_plan_id).maybeSingle(),
    admin.from("membership_plan_prices")
      .select("id,amount_pence,stripe_price_id")
      .eq("plan_id", checkoutApplication.requested_plan_id)
      .eq("membership_year", billingYear).eq("active", true).maybeSingle(),
  ]);
  if (!plan?.stripe_product_id || !price?.stripe_price_id) {
    throw new Error("Online membership payment is not configured for this plan.");
  }

  const initialAmount = proratedMembershipFee(price.amount_pence, createdAt);
  const renewalAt = membershipRenewalAt(billingYear);
  const origin = getTrustedAppOrigin();
  const session = await getStripe().checkout.sessions.create({
    integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER,
    mode: "subscription",
    customer_email: checkoutApplication.contact_email,
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
      { quantity: 1, price: price.stripe_price_id },
    ],
    metadata: {
      ydsme_integration: "memberships",
      membership_application_id: checkoutApplication.id,
      membership_plan_price_id: price.id,
      membership_initial_amount_pence: String(initialAmount),
      membership_auto_renew: String(checkoutApplication.auto_renew),
    },
    subscription_data: {
      trial_end: Math.floor(renewalAt.getTime() / 1000),
      metadata: {
        ydsme_integration: "memberships",
        membership_application_id: checkoutApplication.id,
        membership_plan_price_id: price.id,
      },
    },
    success_url: `${origin}/membership?application=payment-received`,
    cancel_url: `${origin}/membership?application=payment-cancelled`,
  });
  if (!session.url) throw new Error("Stripe Checkout did not return a secure payment URL.");
  return session.url;
}

export async function createApplicationCheckoutFromToken(token: string) {
  if (token.length < 20 || token.length > 200) throw new Error("Invalid membership link.");
  const hash = membershipTokenHash(token);
  const { data, error } = await createServiceClient().from("membership_applications")
    .select("id,status,verification_expires_at")
    .eq("verification_token_hash", hash).maybeSingle();
  if (error || !data || data.status !== "awaiting_payment" || new Date(data.verification_expires_at) <= new Date()) {
    throw new Error("This membership payment link is no longer valid.");
  }
  return createApplicationCheckout(data.id);
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

export async function createMemberRenewalCheckout(userId: string, autoRenew: boolean) {
  const admin = createServiceClient();
  const { data: member, error } = await admin.from("members")
    .select("id,full_name,contact_email,current_plan_id,effective_state,membership_subscriptions(stripe_customer_id,status)")
    .eq("auth_user_id", userId).maybeSingle();
  if (error || !member?.contact_email || !member.current_plan_id
    || ["honorary", "suspended", "archived"].includes(member.effective_state)) {
    throw new Error("This membership is not available for online renewal.");
  }
  const now = new Date();
  const membershipYear = membershipBillingYear(now);
  const [{ data: price }, { data: term }, { data: plan }] = await Promise.all([
    admin.from("membership_plan_prices").select("id,amount_pence,stripe_price_id")
      .eq("plan_id", member.current_plan_id).eq("membership_year", membershipYear).eq("active", true).maybeSingle(),
    admin.from("membership_terms").select("status,amount_paid_pence")
      .eq("member_id", member.id).eq("membership_year", membershipYear).maybeSingle(),
    admin.from("membership_plans").select("name,stripe_product_id").eq("id", member.current_plan_id).maybeSingle(),
  ]);
  if (term?.status === "paid" || (term?.amount_paid_pence ?? 0) > 0) {
    throw new Error("This membership term is already paid.");
  }
  if (!price?.stripe_price_id || !plan?.stripe_product_id) {
    throw new Error("Online renewal is not configured for this membership tier.");
  }
  const amount = membershipYear > now.getUTCFullYear()
    ? price.amount_pence
    : proratedMembershipFee(price.amount_pence, now);
  const subscriptions = member.membership_subscriptions as Array<{ stripe_customer_id: string; status: string }> | null;
  if (subscriptions?.[0] && !["canceled", "incomplete_expired"].includes(subscriptions[0].status)) {
    throw new Error("An existing Stripe subscription must be managed instead of replaced.");
  }
  const customerId = subscriptions?.[0]?.stripe_customer_id;
  const session = await getStripe().checkout.sessions.create({
    integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER,
    mode: "subscription",
    ...(customerId ? { customer: customerId } : { customer_email: member.contact_email }),
    client_reference_id: member.id,
    line_items: [
      { quantity: 1, price_data: { currency: "gbp", unit_amount: amount, product: plan.stripe_product_id } },
      { quantity: 1, price: price.stripe_price_id },
    ],
    metadata: {
      ydsme_integration: "memberships",
      membership_member_id: member.id,
      membership_plan_price_id: price.id,
      membership_year: String(membershipYear),
      membership_initial_amount_pence: String(amount),
      membership_auto_renew: String(autoRenew),
    },
    subscription_data: {
      trial_end: Math.floor(membershipRenewalAt(membershipYear).getTime() / 1000),
      metadata: {
        ydsme_integration: "memberships",
        membership_member_id: member.id,
        membership_plan_price_id: price.id,
        membership_year: String(membershipYear),
      },
    },
    success_url: `${getTrustedAppOrigin()}/account?notice=payment-received`,
    cancel_url: `${getTrustedAppOrigin()}/account?error=payment-cancelled`,
  });
  if (!session.url) throw new Error("Stripe Checkout did not return a secure payment URL.");
  return session.url;
}

/**
 * Link an existing portal profile or send the first Supabase invitation after
 * payment/honorary activation. Safe to call repeatedly from webhook retries.
 */
export async function ensureMemberPortalInvitation(memberId: string) {
  const admin = createServiceClient();
  const { data: member, error: memberError } = await admin.from("members")
    .select("id,full_name,contact_email,auth_user_id")
    .eq("id", memberId).maybeSingle();
  if (memberError) throw new Error("Unable to prepare the member portal invitation.");
  if (!member?.contact_email || member.auth_user_id) return;

  const { data: profile, error: profileError } = await admin.from("users")
    .select("id").ilike("email", member.contact_email).maybeSingle();
  if (profileError) throw new Error("Unable to check the member portal account.");
  if (profile) {
    const { error } = await admin.from("members").update({ auth_user_id: profile.id }).eq("id", member.id);
    if (error) throw new Error("Unable to link the member portal account.");
    return;
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(member.contact_email, {
    data: { full_name: member.full_name },
    redirectTo: `${getTrustedAppOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error || !data.user) throw new Error("Unable to send the member portal invitation.");
  const { error: linkError } = await admin.from("members")
    .update({ auth_user_id: data.user.id })
    .eq("id", member.id)
    .is("auth_user_id", null);
  if (linkError) throw new Error("Unable to link the invited portal account.");
}
