import assert from "node:assert/strict";
import { readLocalSupabaseEnvironment } from "../tests/local-supabase.mjs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const local = readLocalSupabaseEnvironment("Local Stripe membership setup");

const stripeKey = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
assert.match(stripeKey || "", /^(?:rk|sk)_test_/, "Local membership setup requires a Stripe test-mode key.");
const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: plans, error: planError } = await admin.from("membership_plans")
  .select("id,slug,name,stripe_product_id")
  .eq("active", true)
  .order("sort_order");
assert.equal(planError, null, `Unable to read local membership plans: ${planError?.message || "unknown error"}`);
assert.ok(plans?.length, "No active local membership plans were found.");

let productsCreated = 0;

async function validProduct(productId) {
  if (!productId) return null;
  try {
    const product = await stripe.products.retrieve(productId);
    return !product.deleted && product.active && !product.livemode ? product : null;
  } catch {
    return null;
  }
}

for (const plan of plans) {
  let product = await validProduct(plan.stripe_product_id);
  if (!product) {
    product = await stripe.products.create({
      name: `${plan.name} membership`,
      metadata: {
        ydsme_integration: "memberships",
        membership_plan_id: plan.id,
        membership_plan: plan.slug,
        environment: "local_pilot",
      },
    });
    assert.equal(product.livemode, false, "Stripe unexpectedly created a live Product.");
    const { error } = await admin.from("membership_plans")
      .update({ stripe_product_id: product.id, updated_at: new Date().toISOString() })
      .eq("id", plan.id);
    assert.equal(error, null, `Unable to save the ${plan.slug} test Product.`);
    productsCreated += 1;
  }
}

console.log(JSON.stringify({
  target: "local-test-only",
  plans: plans.length,
  productsCreated,
  pricing: "one-time amounts supplied by the website; no recurring prices created",
}));
