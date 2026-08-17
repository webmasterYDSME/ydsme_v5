import "server-only";

import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  client = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  return client;
}
