import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { LOCAL_SUPABASE_URL, readLocalSupabaseEnvironment } from "./local-supabase.mjs";

const local = readLocalSupabaseEnvironment("Browser smoke tests");
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3013",
  JOURNEY_PORT: "3013",
  JOURNEY_START_MODE: "production",
  MEMBERSHIP_MODE: "live",
};

for (const [command, args] of [
  ["npm", ["run", "build"]],
  ["npx", ["playwright", "test"]],
]) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed.`);
}
