import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const port = process.env.STRIPE_JOURNEY_PORT || "3014";
assert.match(port, /^\d{4,5}$/, "STRIPE_JOURNEY_PORT must be a local port.");
const siteUrl = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  MEMBERSHIP_MODE: "live",
  NEXT_PUBLIC_SITE_URL: siteUrl,
  STRIPE_JOURNEY_SITE_URL: siteUrl,
  SUPABASE_TEST_WORKDIR: ".supabase-test",
};

const build = spawnSync("npm", ["run", "build"], { env: environment, stdio: "inherit" });
assert.equal(build.status, 0, "The production app could not be built for the Stripe journey.");

const app = spawn("npx", ["next", "start", "-p", port], { env: environment, stdio: "inherit" });
try {
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${siteUrl}/membership/apply`, { redirect: "manual" });
      if (response.status === 200) { ready = true; break; }
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `The membership journey app did not start at ${siteUrl}.`);
  Object.assign(process.env, environment);
  await import("./stripe-membership-journey.mjs");
} finally {
  app.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => app.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}
