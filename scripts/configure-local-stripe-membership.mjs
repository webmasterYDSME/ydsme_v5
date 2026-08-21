import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const workdir = process.env.SUPABASE_TEST_WORKDIR || ".supabase-test";
assert.equal(workdir, ".supabase-test", "Local Stripe membership setup requires the isolated Supabase workdir.");
const status = execFileSync("npx", ["supabase", "status", "--workdir", workdir, "-o", "env"], {
  encoding: "utf8",
});
const local = Object.fromEntries(status.split("\n").flatMap((line) => {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert.equal(local.API_URL, "http://127.0.0.1:55321", "Refusing to configure a non-local Supabase project.");
assert.ok(local.SERVICE_ROLE_KEY, "The local Supabase service-role key is unavailable.");

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
let pricesCreated = 0;
let snapshotsConfigured = 0;

async function validProduct(productId) {
  if (!productId) return null;
  try {
    const product = await stripe.products.retrieve(productId);
    return !product.deleted && !product.livemode ? product : null;
  } catch {
    return null;
  }
}

async function validAnnualPrice(priceId, productId, amountPence) {
  if (!priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    return !price.livemode
      && price.active
      && price.product === productId
      && price.currency === "gbp"
      && price.unit_amount === amountPence
      && price.recurring?.interval === "year"
      ? price
      : null;
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

  const { data: snapshots, error: snapshotError } = await admin.from("membership_plan_prices")
    .select("id,membership_year,amount_pence,stripe_price_id")
    .eq("plan_id", plan.id)
    .eq("active", true)
    .order("membership_year");
  assert.equal(snapshotError, null, `Unable to read ${plan.slug} annual fees.`);
  assert.ok(snapshots?.length, `No annual fee exists for ${plan.slug}.`);
  const pricesByAmount = new Map();
  for (const snapshot of snapshots) {
    let annualPrice = await validAnnualPrice(snapshot.stripe_price_id, product.id, snapshot.amount_pence);
    if (!annualPrice) annualPrice = pricesByAmount.get(snapshot.amount_pence) || null;
    if (!annualPrice) {
      annualPrice = await stripe.prices.create({
        product: product.id,
        currency: "gbp",
        unit_amount: snapshot.amount_pence,
        recurring: { interval: "year" },
        metadata: {
          ydsme_integration: "memberships",
          membership_plan_id: plan.id,
          membership_plan: plan.slug,
          effective_from_year: String(snapshot.membership_year),
          environment: "local_pilot",
        },
      });
      assert.equal(annualPrice.livemode, false, "Stripe unexpectedly created a live Price.");
      pricesCreated += 1;
    }
    pricesByAmount.set(snapshot.amount_pence, annualPrice);
    if (snapshot.stripe_price_id !== annualPrice.id) {
      const { error } = await admin.from("membership_plan_prices")
        .update({ stripe_price_id: annualPrice.id })
        .eq("id", snapshot.id);
      assert.equal(error, null, `Unable to configure the ${plan.slug} ${snapshot.membership_year} test Price.`);
      snapshotsConfigured += 1;
    }
  }
}

console.log(JSON.stringify({
  target: "local-test-only",
  plans: plans.length,
  productsCreated,
  pricesCreated,
  snapshotsConfigured,
}));
