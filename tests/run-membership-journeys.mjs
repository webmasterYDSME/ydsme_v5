import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { LOCAL_SUPABASE_URL, readLocalSupabaseEnvironment } from "./local-supabase.mjs";

const local = readLocalSupabaseEnvironment("Membership browser journeys");
const password = process.env.JOURNEY_TEST_PASSWORD || "LocalJourneyOnly-2026!";
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(projectId, "Unable to identify the local Supabase project.");
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3011",
  JOURNEY_PORT: "3011",
  JOURNEY_START_MODE: "production",
  JOURNEY_TEST_MODE: "true",
  LOCAL_MAILPIT_URL: "http://127.0.0.1:55324",
  JOURNEY_MEMBERSHIP_TESTS: "true",
  JOURNEY_MEMBERSHIP_WORKSPACE: "true",
  JOURNEY_TEST_PASSWORD: password,
  MEMBERSHIP_MODE: "live",
  TURNSTILE_SECRET_KEY: "",
  NEXT_PUBLIC_TURNSTILE_SITEKEY: "",
  RESEND_API_KEY: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_RESTRICTED_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
};

function run(command, args) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed.`);
}

function cleanMembershipJourneys() {
  const sql = String.raw`
begin;
delete from public.membership_notifications where kind='membership.renewal-invitation' and member_id in(select member_id from public.membership_renewal_invitations where membership_year in(select membership_year from public.membership_renewal_campaigns where opened_by in(select id from auth.users where email='journey.membership.officer@example.test')));
delete from public.membership_renewal_invitations where membership_year in(select membership_year from public.membership_renewal_campaigns where opened_by in(select id from auth.users where email='journey.membership.officer@example.test'));
delete from public.membership_renewal_campaigns where opened_by in(select id from auth.users where email='journey.membership.officer@example.test');
delete from public.membership_signup_sessions where email like 'journey.%@example.test';
delete from public.rate_limits where scope in ('membership-application','membership-verification-resend','membership-contact-change','signup-code-email','signup-code-ip','signup-code-cooldown','signup-code-verify','signup-code-global');
delete from public.membership_contact_change_requests where member_id in (
  select id from public.members where full_name like 'Journey Membership%'
);
delete from public.membership_notifications where application_id in (
  select id from public.membership_applications where contact_email in (
    'journey.membership.adult@example.test','journey.membership.student@example.test','journey.membership.junior@example.test','journey.membership.concession@example.test','journey.membership.guardian-led@example.test'
  )
) or member_id in (select id from public.members where full_name like 'Journey Membership%');
delete from public.membership_offline_payment_records where application_id in (
  select id from public.membership_applications where contact_email in (
    'journey.membership.adult@example.test','journey.membership.student@example.test','journey.membership.junior@example.test','journey.membership.concession@example.test','journey.membership.guardian-led@example.test'
  )
) or member_id in (select id from public.members where full_name like 'Journey Membership%')
  or term_id in (
    select id from public.membership_terms where member_id in (
      select id from public.members where full_name like 'Journey Membership%'
    )
  );
delete from public.membership_payments where term_id in (
  select id from public.membership_terms where member_id in (
    select id from public.members where full_name like 'Journey Membership%'
  )
);
delete from public.membership_terms where member_id in (
  select id from public.members where full_name like 'Journey Membership%'
);
delete from public.honorary_memberships where member_id in (
  select id from public.members where full_name like 'Journey Membership%'
);
delete from public.membership_subscriptions where member_id in (
  select id from public.members where full_name like 'Journey Membership%'
);
delete from public.members where full_name like 'Journey Membership%';
delete from public.membership_applications where contact_email in (
  'journey.membership.adult@example.test','journey.membership.student@example.test','journey.membership.junior@example.test','journey.membership.concession@example.test','journey.membership.guardian-led@example.test'
);
delete from auth.users where email like 'journey.membership.%@example.test';
update public.membership_payment_settings_versions set active=false
  where treasurer_email='journey.treasurer@example.test';
update public.membership_payment_settings_versions set active=true
  where id=(
    select id from public.membership_payment_settings_versions
    where treasurer_email<>'journey.treasurer@example.test' order by version desc limit 1
  ) and not exists(select 1 from public.membership_payment_settings_versions where active);
delete from public.membership_payment_settings_versions
  where treasurer_email='journey.treasurer@example.test';
commit;`;
  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
  );
  assert.equal(result.status, 0, "Unable to clean isolated membership journey fixtures.");
}

let fixturesCreated = false;
try {
  cleanMembershipJourneys();
  run(process.execPath, ["scripts/configure-local-supabase.mjs"]);
  run("npm", ["run", "build"]);
  run(process.execPath, ["tests/journey-fixtures.mjs", "setup"]);
  fixturesCreated = true;
  run("npx", ["playwright", "test", "tests/browser/membership-journeys.spec.mjs", "--grep", "active members can|committee members can|DOB selects|application presents|membership officer page fits|honorary creation|membership officer configures|administrator grants", "--workers=1"]);
  cleanMembershipJourneys();
  run("npx", ["playwright", "test", "tests/browser/membership-simple.spec.mjs", "tests/browser/membership-workspace.spec.mjs", "--workers=1"]);
} finally {
  cleanMembershipJourneys();
  if (fixturesCreated) run(process.execPath, ["tests/journey-fixtures.mjs", "cleanup"]);
}
