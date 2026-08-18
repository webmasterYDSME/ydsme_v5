import { execFileSync, spawn } from "node:child_process";

const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const local = Object.fromEntries(status.split("\n").flatMap((line) => {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  return match ? [[match[1], match[2]]] : [];
}));
if (local.API_URL !== "http://127.0.0.1:54321" || !local.PUBLISHABLE_KEY || !local.SERVICE_ROLE_KEY) {
  throw new Error("The isolated local Supabase stack is not available.");
}

const port = process.env.JOURNEY_PORT || "3010";
if (!/^\d{4,5}$/.test(port)) throw new Error("JOURNEY_PORT must be a valid local port.");
const production = process.env.JOURNEY_START_MODE === "production";
const child = spawn("npx", ["next", production ? "start" : "dev", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
    ENABLE_VISITOR_BOOKINGS: "true",
    NEXT_PUBLIC_ENABLE_VISITOR_BOOKINGS: "true",
    ENABLE_DONATIONS: "false",
    NEXT_PUBLIC_ENABLE_DONATIONS: "false",
    TURNSTILE_SECRET_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITEKEY: "",
    RESEND_API_KEY: "",
    BOOKINGS_FROM_EMAIL: "",
    WORKSHOPS_FROM_EMAIL: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    RATE_LIMIT_SECRET: "local-journey-rate-limit-secret",
    CRON_SECRET: "local-journey-cron-secret",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
