"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDonationSettings } from "@/lib/data";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { verifyTurnstile } from "@/lib/turnstile";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";

const checkoutSchema = z.object({
  campaign: z.enum(["generic", "target"]),
  amount: z.coerce.number().min(1).max(10_000),
});

export async function startDonationCheckout(formData: FormData) {
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
  const donationLabel = parsed.data.campaign === "target"
    ? `Donation: ${campaign.title}`
    : "Donation to York Model Engineers";
  const donationMetadata = {
    payment_type: "donation",
    donation_campaign: parsed.data.campaign,
    donation_campaign_name: campaign.title,
    ydsme_integration: "donations",
  };
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
            name: donationLabel,
            description: campaign.description,
          },
        },
      },
    ],
    metadata: donationMetadata,
    payment_intent_data: {
      description: donationLabel,
      metadata: donationMetadata,
    },
    success_url: `${origin}/thank-you?donation=success`,
    cancel_url: `${origin}${cancelPath}`,
  });

  if (!session.url) throw new Error("Stripe Checkout did not return a secure payment URL.");
  redirect(session.url);
}
