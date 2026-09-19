// Replays a test-mode Stripe payment event into the local website, for a payment made while the
// Stripe listener (npm run stripe:listen-local) was not running. It fetches the real event from
// Stripe, signs it with the local webhook secret from .env.local and posts it to the local webhook,
// so the membership is updated exactly as if the listener had delivered it.
//
//   node --env-file=.env.local scripts/replay-local-stripe-event.mjs            list recent payments
//   node --env-file=.env.local scripts/replay-local-stripe-event.mjs cs_test_…  replay one checkout
//   node --env-file=.env.local scripts/replay-local-stripe-event.mjs evt_…      replay one event
import assert from "node:assert/strict";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
assert.match(stripeKey || "", /^(?:rk|sk)_test_/, "A Stripe test-mode key is required.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:55321", "Replay is for the local Supabase stack only.");
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010");
assert.ok(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname), "The webhook must be a local address.");
const secret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
assert.match(secret, /^whsec_/, "No local webhook signing secret is set in .env.local.");

const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });
const target = process.argv[2];
const { data: recent } = await stripe.events.list({ type: "checkout.session.completed", limit: 100 });

if (!target) {
  console.log("Recent completed checkouts (newest first). Re-run with a cs_test_… or evt_… id to replay one.\n");
  for (const event of recent.slice(0, 15)) {
    const session = event.data.object;
    console.log(`${session.id}  ${event.id}  £${((session.amount_total ?? 0) / 100).toFixed(2)}  ${new Date(event.created * 1000).toLocaleString("en-GB")}  ${session.customer_details?.email ?? ""}  ${session.metadata?.membership_year ?? ""}`);
  }
  process.exit(0);
}

const event = target.startsWith("evt_")
  ? await stripe.events.retrieve(target)
  : recent.find((item) => item.data.object.id === target);
assert.ok(event, `No completed checkout found for ${target}. Stripe only keeps events for 30 days.`);
assert.equal(event.type, "checkout.session.completed", "Only completed checkouts can be replayed.");

const payload = JSON.stringify(event);
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
const endpoint = new URL("/api/stripe/webhook", site).href;
const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload });
console.log(`${event.id} → ${endpoint}: ${response.status} ${await response.text()}`);
if (!response.ok) process.exitCode = 1;
