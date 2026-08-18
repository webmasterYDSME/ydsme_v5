"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDonationSettings } from "@/lib/data";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { verifyTurnstile } from "@/lib/turnstile";
import { donationsEnabled } from "@/lib/features";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";

const checkoutSchema = z.object({
  campaign: z.enum(["generic", "target"]),
  amount: z.coerce.number().min(1).max(10_000),
});

export async function startDonationCheckout(formData: FormData) {
  if (!donationsEnabled()) redirect("/?donation=unavailable");
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/?donation=invalid");
  if (!await verifyTurnstile(String(formData.get("captchaToken") || ""))) {
    redirect("/?donation=security-check");
  }
  if (!await consumeRateLimit("donation-checkout", 8, 15 * 60, parsed.data.campaign)) {
    redirect("/?donation=rate-limited");
  }

  const donations = await getDonationSettings();
  const campaign = donations[parsed.data.campaign];
  if (!campaign.enabled) redirect("/?donation=unavailable");

  const amountPence = Math.round(parsed.data.amount * 100);
  const origin = getTrustedAppOrigin();
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
