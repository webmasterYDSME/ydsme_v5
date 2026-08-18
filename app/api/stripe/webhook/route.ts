import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ received: false }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return Response.json({ received: false }, { status: 400 });
  }

  try {
    let targetChanged = false;
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      targetChanged = await recordCheckoutPayment(event);
    } else if (event.type === "charge.refunded") {
      targetChanged = await recordRefund(event);
    }

    if (targetChanged) revalidatePath("/");
    return Response.json({ received: true });
  } catch (error) {
    console.error(
      "Stripe webhook processing failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json({ received: false }, { status: 500 });
  }
}
