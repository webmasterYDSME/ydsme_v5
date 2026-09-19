import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { readLocalSupabaseEnvironment } from "../tests/local-supabase.mjs";

const local = readLocalSupabaseEnvironment("Local Stripe listener");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, local.API_URL);
const stripeKey = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
assert.match(stripeKey || "", /^(?:rk|sk)_test_/, "A Stripe test-mode key is required.");
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010");
assert.ok(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname), "Webhook forwarding must remain local.");
const environment = { ...process.env, STRIPE_API_KEY: stripeKey };
// Capture the signing secret without exposing it in terminal output or arguments.
const secret = execFileSync("stripe", ["listen", "--print-secret", "--skip-update"], {
  env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
assert.match(secret, /^whsec_[A-Za-z0-9]+$/);
const envPath = ".env.local";
const source = readFileSync(envPath, "utf8");
const entry = `STRIPE_MEMBERSHIP_WEBHOOK_SECRET=${secret}`;
const updated = /^STRIPE_MEMBERSHIP_WEBHOOK_SECRET=.*$/m.test(source)
  ? source.replace(/^STRIPE_MEMBERSHIP_WEBHOOK_SECRET=.*$/m, entry)
  : `${source.trimEnd()}\n${entry}\n`;
if (updated !== source) writeFileSync(envPath, updated, { mode: 0o600 });

const endpoint = new URL("/api/stripe/webhook", site).href;
console.log(`Test-mode Stripe webhooks → ${endpoint}`);
console.log("Membership signing secret saved in .env.local. Keep this command running alongside npm run dev.");
// Newer Stripe CLI versions refuse to listen without an explicit event list. These are the events
// app/api/stripe/webhook/route.ts handles; anything else would only be acknowledged and ignored.
const events = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "checkout.session.expired", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed",
  "invoice.payment_action_required", "invoice.finalization_failed", "charge.refunded",
  "charge.dispute.created", "charge.dispute.closed",
].join(",");
const listener = spawn("stripe", ["listen", "--skip-update", "--events", events, "--forward-to", endpoint], {
  env: environment, stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [listener.stdout, listener.stderr]) {
  createInterface({ input: stream }).on("line", (line) => {
    console.log(line.replace(/(?:whsec_|[sr]k_test_)[A-Za-z0-9]+/g, "[redacted]"));
  });
}
listener.on("error", () => {
  console.error("Unable to start Stripe CLI. Install it and retry.");
  process.exitCode = 1;
});
listener.on("exit", (code) => { process.exitCode = code || 0; });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => listener.kill(signal));
}
