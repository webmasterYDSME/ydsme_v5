import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the account page is split into sections, each in its own component", async () => {
  const page = await read("app/account/page.tsx");
  for (const section of ["AccountBanner", "MembershipSection", "ProfileSection", "SignInSection", "EmailPreferencesSection", "UpdatesSection"]) {
    assert.match(page, new RegExp(`<${section}\\b`), `${section} is used on the page`);
    await read(`app/account/_components/${section}.tsx`);
  }
  assert.ok(page.split("\n").length < 100, "the page only loads data and composes sections");
  assert.match(page, /requireUser\(\)/);
});

test("members choose the newsletter themselves and are told system emails still arrive", async () => {
  const [section, action, reader, migration] = await Promise.all([
    read("app/account/_components/EmailPreferencesSection.tsx"), read("lib/actions/account.ts"),
    read("lib/newsletter-preference.ts"), read("supabase/migrations/202609190024_member_newsletter_preference.sql"),
  ]);
  assert.match(section, /System emails will still be sent/);
  assert.match(section, /cannot be switched off/);
  assert.match(section, /setNewsletterPreference/);
  // The choice goes through the signed-in member's own session, never the service key, so it can only change their own record.
  assert.match(action, /requireUser\(\)/);
  assert.match(action, /createClient\(\)/);
  assert.doesNotMatch(action, /createServiceClient|createAdminClient/);
  assert.match(action, /consumeRateLimit\("account-newsletter"/);
  assert.doesNotMatch(reader, /createServiceClient|createAdminClient/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.set_own_newsletter_preference\(boolean\) from public, anon/);
  assert.match(migration, /transactional_suppressed/);
});

test("the page explains each result instead of a generic message where it can", async () => {
  const format = await read("app/account/format.ts");
  for (const key of ["profile-updated", "newsletter-subscribed", "newsletter-unsubscribed", "newsletter-address-blocked", "renewal-unavailable"]) {
    assert.match(format, new RegExp(`"${key}"`));
  }
});
