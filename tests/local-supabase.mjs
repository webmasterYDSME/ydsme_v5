import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:55321";

export function readLocalSupabaseEnvironment(purpose) {
  const status = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
  });
  const environment = Object.fromEntries(status.split("\n").flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    return match ? [[match[1], match[2]]] : [];
  }));

  assert.equal(
    environment.API_URL,
    LOCAL_SUPABASE_URL,
    `${purpose} may run only against the isolated local Supabase stack.`,
  );
  assert.ok(environment.SERVICE_ROLE_KEY, "The local Supabase service-role key is unavailable.");
  assert.ok(
    environment.PUBLISHABLE_KEY || environment.ANON_KEY,
    "The local Supabase publishable key is unavailable.",
  );

  return {
    ...environment,
    PUBLISHABLE_KEY: environment.PUBLISHABLE_KEY || environment.ANON_KEY,
    ANON_KEY: environment.ANON_KEY || environment.PUBLISHABLE_KEY,
  };
}
