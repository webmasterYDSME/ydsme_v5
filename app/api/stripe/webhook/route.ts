import { revalidatePath, revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { writeAudit } from "@/lib/audit";
import { PUBLIC_DONATIONS_CACHE_TAG } from "@/lib/cache-tags";
import {
  ensureMemberPortalInvitation,
  ensureMembershipPlanPrice,
  MEMBERSHIP_INTEGRATION_IDENTIFIER,
  processMembershipProviderCommands,
} from "@/lib/membership";
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const INTEGRATION_IDENTIFIER = "ydsme_hkqmwzpt";
type Campaign = "generic" | "target";

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function campaignFrom(session: Stripe.Checkout.Session): Campaign | null {
  const campaign = session.metadata?.donation_campaign;
  return campaign === "generic" || campaign === "target" ? campaign : null;
}

async function recordCheckoutPayment(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const campaign = campaignFrom(session);
  if (
    session.integration_identifier !== INTEGRATION_IDENTIFIER ||
    session.metadata?.ydsme_integration !== "donations" ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    !campaign ||
    session.currency !== "gbp" ||
    !session.amount_total ||
    session.amount_total < 100
  ) {
    return false;
  }

  const paymentIntentId = stripeId(session.payment_intent);
  let refundedPence = 0;
  let paymentStatus: "paid" | "refunded" = "paid";

  if (paymentIntentId) {
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    const charge = typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
    refundedPence = Math.min(charge?.amount_refunded ?? 0, session.amount_total);
    paymentStatus = charge?.refunded ? "refunded" : "paid";
  }

  const timestamp = new Date(event.created * 1000).toISOString();
  const { error } = await createAdminClient().from("donation_payments").upsert({
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_event_id: event.id,
    campaign,
    amount_pence: session.amount_total,
    refunded_pence: refundedPence,
    currency: "gbp",
    payment_status: paymentStatus,
    paid_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "stripe_checkout_session_id" });

  if (error) throw new Error(`Unable to record the verified donation: ${error.message}`);
  return campaign === "target";
}

async function recordRefund(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId || charge.currency !== "gbp") return false;

  const { data, error } = await createAdminClient()
    .from("donation_payments")
    .update({
      refunded_pence: Math.min(charge.amount_refunded, charge.amount),
      payment_status: charge.refunded ? "refunded" : "paid",
      stripe_event_id: event.id,
      updated_at: new Date(event.created * 1000).toISOString(),
    })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("campaign");

  if (error) throw new Error(`Unable to reconcile the verified refund: ${error.message}`);
  return data?.some((payment) => payment.campaign === "target") ?? false;
}

function timestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const items = subscription.items.data.filter((item) => !item.deleted);
  return {
    start: items.length ? timestamp(Math.min(...items.map((item) => item.current_period_start))) : null,
    end: items.length ? timestamp(Math.max(...items.map((item) => item.current_period_end))) : null,
    priceId: items.find((item) => item.price.recurring)?.price.id ?? null,
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return stripeId(invoice.parent?.subscription_details?.subscription ?? null);
}

async function invoicePaymentIds(invoiceId: string) {
  const payments = await getStripe().invoicePayments.list({
    invoice: invoiceId,
    limit: 10,
    expand: ["data.payment.payment_intent.latest_charge"],
  });
  const payment = payments.data.find((candidate) => candidate.is_default) ?? payments.data[0];
  const intent = payment?.payment.payment_intent;
  const intentId = stripeId(intent ?? null);
  const chargeId = typeof intent === "object" ? stripeId(intent.latest_charge) : stripeId(payment?.payment.charge ?? null);
  return { intentId, chargeId };
}

async function activateMembershipCheckout(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (
    session.integration_identifier !== MEMBERSHIP_INTEGRATION_IDENTIFIER
    || session.metadata?.ydsme_integration !== "memberships"
    || !["subscription", "payment"].includes(session.mode)
    || session.payment_status !== "paid"
    || session.status !== "complete"
    || session.currency !== "gbp"
  ) return false;

  const applicationId = session.metadata.membership_application_id;
  const existingMemberId = session.metadata.membership_member_id;
  const planPriceId = session.metadata.membership_plan_price_id;
  const membershipYear = Number(session.metadata.membership_year);
  const expectedAmount = Number(session.metadata.membership_initial_amount_pence);
  const customerId = stripeId(session.customer);
  if ((!applicationId && !existingMemberId) || (applicationId && existingMemberId)
    || !Number.isSafeInteger(membershipYear)
    || !planPriceId || !Number.isSafeInteger(expectedAmount)
    || expectedAmount <= 0 || session.amount_total !== expectedAmount || !customerId) {
    throw new Error("Verified membership Checkout metadata is incomplete.");
  }

  const subscriptionId = stripeId(session.subscription);
  const invoiceId = stripeId(session.invoice);
  if (session.mode === "subscription" && (!subscriptionId || !invoiceId)) throw new Error("Missing legacy subscription references.");
  const subscription = subscriptionId ? await getStripe().subscriptions.retrieve(subscriptionId) : null;
  if (subscription && subscription.metadata?.ydsme_integration !== "memberships") throw new Error("Invalid subscription metadata.");
  const payment = session.mode === "payment" ? { intentId: stripeId(session.payment_intent) } : await invoicePaymentIds(invoiceId!);
  if (!payment.intentId) throw new Error("Verified membership payment has no payment reference.");
  const { data: planPrice, error: planPriceError } = await createServiceClient()
    .from("membership_plan_prices")
    .select("id,plan_id,stripe_price_id,membership_year")
    .eq("id", planPriceId)
    .maybeSingle();
  if (planPriceError || !planPrice || planPrice.membership_year !== membershipYear) {
    throw new Error("Verified membership payment refers to an unavailable annual price.");
  }

  const renewalPrice = subscription ? await ensureMembershipPlanPrice(planPrice.plan_id, membershipYear + 1) : null;
  const desiredCancelAtPeriodEnd = subscription ? session.metadata.membership_auto_renew === "false" || subscription.cancel_at_period_end : false;
  const period = subscription ? subscriptionPeriod(subscription) : { start: null, end: null };
  const admin = createServiceClient();
  const common = {
    p_plan_price_id: planPriceId,
    p_method: "stripe",
    p_amount_pence: expectedAmount,
    p_actor_id: null,
    p_stripe_checkout_session_id: session.id,
    p_stripe_payment_intent_id: payment.intentId,
    p_stripe_invoice_id: invoiceId,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_subscription_status: subscription?.status ?? null,
    p_cancel_at_period_end: desiredCancelAtPeriodEnd,
    p_current_period_end: period.end,
  };
  const { data, error } = applicationId
    ? await admin.rpc("activate_membership_application_checkout", {
      ...common,
      p_application_id: applicationId,
      p_stripe_event_created_at: new Date(event.created * 1000).toISOString(),
    })
    : await admin.rpc("activate_membership_renewal", {
      ...common,
      p_member_id: existingMemberId,
      p_membership_year: membershipYear,
      p_paid_on: new Date(event.created * 1000).toISOString().slice(0, 10),
      p_current_period_start: period.start,
      p_stripe_event_created_at: new Date(event.created * 1000).toISOString(),
    });
  if (error) throw new Error(`Unable to activate verified membership: ${error.message}`);
  const memberId = (data as Array<{ member_id: string }> | null)?.[0]?.member_id;
  if (!memberId) throw new Error("Verified membership activation returned no member.");
  const postActivationAdmin = createServiceClient();
  if (subscription) await postActivationAdmin.from("membership_subscriptions").update({
    current_period_start: period.start,
    stripe_price_id: renewalPrice?.stripe_price_id,
    stripe_event_created_at: new Date(event.created * 1000).toISOString(),
  }).eq("member_id", memberId);
  await processMembershipProviderCommands(memberId);
  await postActivationAdmin.from("membership_checkout_attempts").update({
    status: "complete",
    stripe_subscription_id: subscriptionId,
    stripe_payment_intent_id: payment.intentId,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("stripe_checkout_session_id", session.id).neq("status", "payment_review");
  if (applicationId) {
    await postActivationAdmin.from("membership_notifications").update({
      email_status: "cancelled",
      updated_at: new Date().toISOString(),
    }).eq("application_id", applicationId)
      .eq("kind", "membership.application-payment-reminder")
      .in("email_status", ["queued", "failed"]);
  }
  await ensureMemberPortalInvitation(memberId);
  return true;
}

async function recordMembershipCheckoutFailure(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.ydsme_integration !== "memberships") return false;
  const applicationId = session.metadata.membership_application_id;
  const memberId = session.metadata.membership_member_id;
  if (!applicationId && !memberId) return false;
  const admin = createServiceClient();
  const { error: attemptError } = await admin.from("membership_checkout_attempts").update({
    status: event.type === "checkout.session.expired" ? "expired" : "failed",
    last_error: event.type === "checkout.session.expired"
      ? "The secure payment page expired before payment was completed."
      : "The payment was not completed and can be retried.",
    updated_at: new Date(event.created * 1000).toISOString(),
  }).eq("stripe_checkout_session_id", session.id).in("status", ["creating", "open"]);
  if (attemptError) throw new Error("Unable to record the failed membership Checkout attempt.");
  const { data: application } = applicationId
    ? await admin.from("membership_applications")
      .select("id,contact_email,full_name,status").eq("id", applicationId).maybeSingle()
    : { data: null };
  if (applicationId && (!application || application.status === "converted")) return true;
  const { data: member } = memberId
    ? await admin.from("members").select("id,contact_email,full_name,auth_user_id").eq("id", memberId).maybeSingle()
    : { data: null };
  const memberName = application?.full_name ?? member?.full_name ?? "The member";
  const { error: notificationError } = await admin.from("membership_notifications").upsert({
    application_id: application?.id ?? null,
    member_id: member?.id ?? null,
    recipient_user_id: member?.auth_user_id ?? null,
    recipient_email: application?.contact_email ?? member?.contact_email ?? null,
    kind: event.type === "checkout.session.expired" ? "membership.checkout-expired" : "membership.checkout-failed",
    title: `${memberName}'s membership payment was not completed`,
    body: `We could not verify ${memberName}'s full payment, so membership has not been activated. Use the existing secure payment link or contact the membership officer.`,
    portal_visible: false,
    deduplication_key: `membership-checkout-${event.type}-${session.id}`,
  }, { onConflict: "deduplication_key", ignoreDuplicates: true });
  if (notificationError) throw new Error("Unable to queue the failed membership Checkout notice.");
  return true;
}

async function reconcileMembershipSubscription(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  if (subscription.metadata?.ydsme_integration !== "memberships") return false;
  const period = subscriptionPeriod(subscription);
  const { error } = await createServiceClient().rpc("reconcile_membership_subscription", {
    p_stripe_subscription_id: subscription.id,
    p_status: subscription.status,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_current_period_start: period.start,
    p_current_period_end: period.end,
    p_stripe_price_id: period.priceId,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
  });
  if (error) throw new Error(`Unable to reconcile membership subscription: ${error.message}`);
  return true;
}

async function reconcileMembershipInvoice(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId || invoice.currency !== "gbp") return false;
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  if (subscription.metadata?.ydsme_integration !== "memberships") return false;
  // The annual renewal starts after the separately paid current term. Stripe
  // can emit zero-value invoices both when the subscription is created and
  // when its future Price is changed without proration. Neither represents a
  // membership payment and must not overwrite the paid term or notify members.
  if (invoice.amount_due === 0 && invoice.amount_paid === 0) return true;
  // Checkout activation records the initial, possibly prorated invoice
  // atomically with the member and term. Stripe can deliver invoice.paid after
  // checkout.session.completed; reconciling that same invoice as an annual
  // renewal would incorrectly replace the prorated amount with the full fee.
  const { data: recordedCheckoutPayment } = await createServiceClient()
    .from("membership_payments")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();
  if (recordedCheckoutPayment) return true;
  const paid = event.type === "invoice.paid" || event.type === "invoice.payment_succeeded";
  const payment = await invoicePaymentIds(invoice.id);
  const admin = createServiceClient();
  const { data: storedSubscription } = await admin.from("membership_subscriptions")
    .select("member_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  const { data: pricedMember } = storedSubscription?.member_id
    ? await admin.from("members").select("current_plan_id").eq("id", storedSubscription.member_id).maybeSingle()
    : { data: null };
  const invoiceYear = new Date(event.created * 1000).getUTCFullYear();
  if (pricedMember?.current_plan_id) {
    await ensureMembershipPlanPrice(pricedMember.current_plan_id, invoiceYear);
  }
  const { data, error } = await admin.rpc("reconcile_membership_invoice", {
    p_stripe_invoice_id: invoice.id,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_payment_intent_id: payment.intentId,
    p_stripe_charge_id: payment.chargeId,
    p_amount_paid_pence: paid ? invoice.amount_paid : invoice.amount_due,
    p_paid: paid,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
  });
  if (error) throw new Error(`Unable to reconcile membership invoice: ${error.message}`);
  const memberId = typeof data === "string" ? data : null;
  if (memberId && invoice.billing_reason !== "subscription_create") {
    const { data: member } = await admin.from("members")
      .select("id,full_name,auth_user_id,contact_email").eq("id", memberId).maybeSingle();
    if (member) {
      const actionRequired = event.type === "invoice.payment_action_required";
      const finalizationFailed = event.type === "invoice.finalization_failed";
      const noticeKind = paid ? "membership.renewal-paid"
        : actionRequired ? "membership.payment-action-required"
          : finalizationFailed ? "membership.invoice-finalization-failed" : "membership.renewal-failed";
      await admin.from("membership_notifications").insert({
        member_id: member.id,
        recipient_user_id: member.auth_user_id,
        recipient_email: member.contact_email,
        kind: noticeKind,
        title: paid ? `${member.full_name}'s annual membership renewal is paid`
          : actionRequired ? `${member.full_name}'s membership payment needs action`
            : finalizationFailed ? `We could not prepare ${member.full_name}'s membership payment` : `${member.full_name}'s membership renewal payment failed`,
        body: paid
          ? `${member.full_name}'s annual membership payment of £${(invoice.amount_paid / 100).toFixed(2)} has been confirmed.`
          : `We could not confirm ${member.full_name}'s renewal payment. Account access remains available during the grace or review period; update the payment method or contact the membership officer.`,
        action_href: "/account",
        deduplication_key: `membership-invoice-notice-${invoice.id}-${noticeKind}`,
      });
    }
  }
  if (paid && memberId && pricedMember?.current_plan_id) {
    const nextYearPrice = await ensureMembershipPlanPrice(pricedMember.current_plan_id, invoiceYear + 1);
    if (!nextYearPrice.stripe_price_id) {
      throw new Error("The next annual membership price is not ready for online renewal.");
    }
    const recurringItem = subscription.items.data.find((item) => item.price.recurring);
    if (recurringItem && recurringItem.price.id !== nextYearPrice.stripe_price_id) {
      await getStripe().subscriptions.update(subscription.id, {
        items: [{ id: recurringItem.id, price: nextYearPrice.stripe_price_id }],
        metadata: {
          ...subscription.metadata,
          membership_plan_price_id: nextYearPrice.id,
          membership_year: String(nextYearPrice.membership_year),
        },
        proration_behavior: "none",
      });
      await admin.from("membership_subscriptions").update({
        stripe_price_id: nextYearPrice.stripe_price_id,
        updated_at: new Date().toISOString(),
      }).eq("stripe_subscription_id", subscription.id);
    }
  }
  return true;
}

async function recordMembershipReversal(event: Stripe.Event) {
  let chargeId: string | null = null;
  let paymentIntentId: string | null = null;
  let refundedPence = 0;
  let disputed = false;
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    chargeId = charge.id;
    paymentIntentId = stripeId(charge.payment_intent);
    refundedPence = charge.amount_refunded;
  } else {
    const dispute = event.data.object as Stripe.Dispute;
    chargeId = stripeId(dispute.charge);
    if (chargeId) {
      const charge = await getStripe().charges.retrieve(chargeId);
      paymentIntentId = stripeId(charge.payment_intent);
    }
    disputed = dispute.status !== "won";
  }
  const { data, error } = await createServiceClient().rpc("mark_membership_payment_reversal", {
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_charge_id: chargeId,
    p_refunded_pence: refundedPence,
    p_disputed: disputed,
    p_stripe_event_id: event.id,
  });
  if (error) throw new Error(`Unable to reconcile membership reversal: ${error.message}`);
  return Boolean(data);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecrets = [...new Set([
    process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
  ].filter((secret): secret is string => Boolean(secret)))];
  if (!signature || !webhookSecrets.length) {
    return Response.json({ received: false }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event | null = null;
  for (const webhookSecret of webhookSecrets) {
    try {
      event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
      break;
    } catch {
      // The same handler can receive separately signed donation and membership endpoints.
    }
  }
  if (!event) return Response.json({ received: false }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { error: claimError } = await admin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processing_status: "processing",
      claimed_at: new Date().toISOString(),
    });
    if (claimError?.code === "23505") {
      const { data: existing, error: existingError } = await admin.from("stripe_webhook_events")
        .select("processing_status,claimed_at")
        .eq("stripe_event_id", event.id)
        .single();
      if (existingError) throw new Error("Unable to inspect the existing Stripe event claim.");
      if (existing.processing_status === "processed") return Response.json({ received: true, replay: true });
      if (existing.processing_status === "processing") {
        const staleBefore = Date.now() - 10 * 60 * 1000;
        if (!existing.claimed_at || new Date(existing.claimed_at).getTime() > staleBefore) {
          return Response.json({ received: false, retry: true }, { status: 409 });
        }
        const { data: reclaimed, error: reclaimError } = await admin.from("stripe_webhook_events")
          .update({ claimed_at: new Date().toISOString(), last_error: null })
          .eq("stripe_event_id", event.id).eq("processing_status", "processing")
          .lt("claimed_at", new Date(staleBefore).toISOString())
          .select("stripe_event_id").maybeSingle();
        if (reclaimError) throw new Error("Unable to recover the stale Stripe event claim.");
        if (!reclaimed) return Response.json({ received: false, retry: true }, { status: 409 });
      } else if (existing.processing_status === "failed") {
        const { data: reclaimed, error: reclaimError } = await admin.from("stripe_webhook_events")
          .update({ processing_status: "processing", claimed_at: new Date().toISOString(), last_error: null })
          .eq("stripe_event_id", event.id)
          .eq("processing_status", "failed")
          .select("stripe_event_id")
          .maybeSingle();
        if (reclaimError) throw new Error("Unable to reclaim the failed Stripe event.");
        if (!reclaimed) return Response.json({ received: false, retry: true }, { status: 409 });
      } else {
        return Response.json({ received: false, retry: true }, { status: 409 });
      }
    }
    if (claimError && claimError.code !== "23505") throw new Error("Unable to claim Stripe event for processing.");

    let targetChanged = false;
    let membershipChanged = false;
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      membershipChanged = await activateMembershipCheckout(event);
      if (!membershipChanged) targetChanged = await recordCheckoutPayment(event);
    } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      membershipChanged = await recordMembershipCheckoutFailure(event);
    } else if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      membershipChanged = await reconcileMembershipSubscription(event);
    } else if (
      event.type === "invoice.paid"
      || event.type === "invoice.payment_succeeded"
      || event.type === "invoice.payment_failed"
      || event.type === "invoice.payment_action_required"
      || event.type === "invoice.finalization_failed"
    ) {
      membershipChanged = await reconcileMembershipInvoice(event);
    } else if (event.type === "charge.refunded") {
      targetChanged = await recordRefund(event);
      membershipChanged = await recordMembershipReversal(event);
    } else if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      membershipChanged = await recordMembershipReversal(event);
    }

    await writeAudit({
      actorUserId: null,
      actorRole: "system",
      action: `stripe.${event.type}`,
      entityType: "stripe_event",
      entityId: event.id,
      after: { processed: true, target_campaign_changed: targetChanged, membership_changed: membershipChanged },
    });
    const { error: completionError } = await admin.from("stripe_webhook_events")
      .update({ processing_status: "processed", completed_at: new Date().toISOString(), last_error: null })
      .eq("stripe_event_id", event.id)
      .eq("processing_status", "processing")
      .select("stripe_event_id")
      .single();
    if (completionError) throw new Error("Unable to complete the Stripe event claim.");
    if (targetChanged) {
      revalidateTag(PUBLIC_DONATIONS_CACHE_TAG, "max");
      revalidatePath("/");
      revalidatePath("/visitors");
    }
    if (membershipChanged) {
      revalidatePath("/account");
      revalidatePath("/admin/memberships");
    }
    return Response.json({ received: true });
  } catch (error) {
    await createAdminClient().from("stripe_webhook_events").update({
      processing_status: "failed",
      last_error: "Processing failed; retry required.",
    }).eq("stripe_event_id", event.id).eq("processing_status", "processing");
    console.error(
      "Stripe webhook processing failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json({ received: false }, { status: 500 });
  }
}
