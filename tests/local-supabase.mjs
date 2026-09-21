import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:55321";

export function readLocalSupabaseEnvironment(purpose) {
  const testWorkdir = process.env.SUPABASE_TEST_WORKDIR;
  if (testWorkdir) {
    assert.equal(
      testWorkdir,
      ".supabase-test",
      "The isolated Supabase test workdir must remain repository-local.",
    );
  }
  const workdirArgs = testWorkdir ? ["--workdir", testWorkdir] : [];
  const status = execFileSync("npx", ["supabase", "status", ...workdirArgs, "-o", "env"], {
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

const LOCAL_DATABASE_CONTAINER = "supabase_db_ydsme_v5";

function localSql(sql) {
  return execFileSync("docker", ["exec", "-i", LOCAL_DATABASE_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8",
  }).trim();
}

/**
 * Who runs membership is a database setting, not an environment variable. The browser and journey runs need
 * the website to run it, so they switch the isolated local database over and put it back when they finish.
 * Returns the mode that was there before.
 */
export function setLocalMembershipMode(mode) {
  assert.ok(mode === "membermojo" || mode === "website", "The membership mode must be membermojo or website.");
  readLocalSupabaseEnvironment("Changing the membership mode");
  const previous = localSql("select public.membership_mode();");
  localSql(`update public.membership_mode_settings set mode = '${mode}', changed_at = now(),
    website_since = case when '${mode}' = 'website' and mode <> 'website' then now() else website_since end where id;`);
  return previous;
}

/** Switches the local database to the given mode now and restores the earlier one when the process ends. */
export function holdLocalMembershipMode(mode) {
  const previous = setLocalMembershipMode(mode);
  let restored = false;
  process.on("exit", () => {
    if (restored) return;
    restored = true;
    try { setLocalMembershipMode(previous); } catch { /* the local stack may already be stopped */ }
  });
  return previous;
}
