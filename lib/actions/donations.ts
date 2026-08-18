"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDonationSettings } from "@/lib/data";
import { getStripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  campaign: z.enum(["generic", "target"]),
  amount: z.coerce.number().min(1).max(10_000),
});

function safeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocal) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function checkoutOrigin() {
  const configured = safeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  const requestOrigin = safeOrigin((await headers()).get("origin"));
  if (requestOrigin) return requestOrigin;
  throw new Error("The public site URL is not configured for Stripe Checkout.");
}

export async function startDonationCheckout(formData: FormData) {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/?donation=invalid");

  const donations = await getDonationSettings();
  const campaign = donations[parsed.data.campaign];
  if (!campaign.enabled) redirect("/?donation=unavailable");

  const amountPence = Math.round(parsed.data.amount * 100);
  const origin = await checkoutOrigin();
  const cancelPath = parsed.data.campaign === "target" ? "/" : "/visitors";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    integration_identifier: "ydsme_hkqmwzpt",
    mode: "payment",
    submit_type: "donate",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: amountPence,
          product_data: {
            name: parsed.data.campaign === "target" ? campaign.title : "Donation to York Model Engineers",
            description: campaign.description,
          },
        },
      },
    ],
    metadata: {
      donation_campaign: parsed.data.campaign,
      ydsme_integration: "donations",
    },
    payment_intent_data: {
      metadata: {
        donation_campaign: parsed.data.campaign,
        ydsme_integration: "donations",
      },
    },
    success_url: `${origin}/thank-you?donation=success`,
    cancel_url: `${origin}${cancelPath}`,
  });

  if (!session.url) throw new Error("Stripe Checkout did not return a secure payment URL.");
  redirect(session.url);
}
