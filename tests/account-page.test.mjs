import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the account page is split into sections, each in its own component", async () => {
  const page = await read("app/account/page.tsx");
  for (const section of ["AccountHeader", "MembershipSection", "ProfileSection", "SignInSection", "AddressSection", "EmailPreferencesSection"]) {
    assert.match(page, new RegExp(`<${section}\\b`), `${section} is used on the page`);
    await read(`app/account/_components/${section}.tsx`);
  }
  assert.ok(page.split("\n").length < 110, "the page only loads data and composes sections");
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

test("members keep their own address and date of birth through their own session", async () => {
  const [section, action, reader, migration] = await Promise.all([
    read("app/account/_components/AddressSection.tsx"), read("lib/actions/account.ts"),
    read("lib/member-details.ts"), read("supabase/migrations/202609190025_member_own_address_and_birth_date.sql"),
  ]);
  assert.match(section, /updateMemberDetails/);
  assert.match(section, /contact the membership officer/);
  assert.match(action, /consumeRateLimit\("account-details"/);
  assert.doesNotMatch(action, /createServiceClient|createAdminClient/);
  assert.doesNotMatch(reader, /createServiceClient|createAdminClient/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /member_birth_date_locked/);
  assert.match(migration, /revoke all on function public\.update_own_member_details\(text, text, text, text, date\) from public, anon/);
});

test("membership updates are shown as notifications that link only to pages on this site", async () => {
  const [section, format] = await Promise.all([read("app/components/NotificationList.tsx"), read("app/account/format.ts")]);
  assert.match(section, /Mark all as read/);
  assert.match(section, /safeInternalHref/);
  assert.match(format, /startsWith\("\/"\)/);
  for (const key of ["address-updated", "address-birth-date-locked"]) assert.match(format, new RegExp(`"${key}"`));
});

test("the page is split into three tabs, and a result message returns people to the tab they were on", async () => {
  const [page, format, banner] = await Promise.all([read("app/account/page.tsx"), read("app/account/format.ts"), read("app/account/_components/AccountHeader.tsx")]);
  assert.match(page, /pickAccountTab\(query, membershipEnabled\)/);
  assert.match(page, /current === "details"[\s\S]*<AddressSection/);
  assert.match(page, /current === "settings"[\s\S]*<EmailPreferencesSection[\s\S]*<SignInSection/);
  assert.match(format, /const available: AccountTab\[\] = membershipEnabled \? \["membership", "details", "settings"\] : \["details", "settings"\]/);
  assert.match(format, /newsletter-\|contact-/);
  assert.match(banner, /aria-current=\{tab\.current \? "page" : undefined\}/);
});

test("notifications live behind a bell in the sidebar and top bar of every portal page, with an unread badge, and only when the membership area is on", async () => {
  const [shell, navigation, list, css, page] = await Promise.all([
    read("app/components/PortalShell.tsx"), read("app/components/PortalNavigation.tsx"), read("app/components/NotificationList.tsx"),
    read("app/components/portal-navigation.module.css"), read("app/account/page.tsx"),
  ]);
  assert.match(shell, /showNotifications \? <NotificationList/);
  assert.match(shell, /getOwnNotifications\(\)/);
  assert.match(navigation, /aria-expanded=\{notificationsOpen\}/);
  assert.match(navigation, /event\.key !== "Escape"/);
  assert.match(navigation, /Notifications, \$\{count\} unread/);
  assert.match(navigation, /openNotificationsEvent/);
  assert.match(css, /\.notifyPanel\[hidden\]/);
  assert.match(list, /markMembershipNotificationRead/);
  assert.match(list, /markAllMembershipNotificationsRead/);
  assert.doesNotMatch(page, /Notification/);
});

test("marking a notification read refreshes every page, because the bell is in the shared layout", async () => {
  const [account, membership] = await Promise.all([read("lib/actions/account.ts"), read("lib/actions/membership.ts")]);
  const after = (source, name) => source.slice(source.indexOf(`export async function ${name}`), source.indexOf(`export async function ${name}`) + 700);
  assert.match(after(account, "markAllMembershipNotificationsRead"), /revalidatePath\("\/", "layout"\)/);
  assert.match(after(membership, "markMembershipNotificationRead"), /revalidatePath\("\/", "layout"\)/);
});
