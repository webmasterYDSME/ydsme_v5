import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("protects member routes with verified Supabase claims", async () => {
  const [proxy, session] = await Promise.all([
    read("lib/supabase/proxy.ts"),
    read("lib/auth.ts"),
  ]);
  assert.match(proxy, /auth\.getClaims\(\)/);
  assert.match(proxy, /\/dashboard/);
  assert.match(proxy, /\/administrator/);
  assert.doesNotMatch(proxy, /auth\.getSession\(\)/);
  assert.match(session, /auth\.getUser\(\)/);
  assert.match(session, /from\("user_roles"\)/);
});

test("keeps private events off public pages", async () => {
  const [data, events, home] = await Promise.all([
    read("lib/data.ts"),
    read("app/events/page.tsx"),
    read("app/page.tsx"),
  ]);
  assert.match(data, /\.eq\("event_type", "public"\)/);
  assert.match(events, /getPublicEvents\(\)/);
  assert.match(home, /getPublicEvents\(\)/);
  assert.doesNotMatch(events, /member_only/);
});

test("requires action-level roles before privileged writes", async () => {
  const actions = await read("lib/actions/content.ts");
  assert.match(actions, /requireRole\(\["administrator", "committee"\]\)/);
  assert.match(actions, /requireRole\(\["administrator"\]\)/);
  assert.match(actions, /image\.size > 8 \* 1024 \* 1024/);
  assert.match(actions, /file\.type !== "application\/pdf"/);
  assert.doesNotMatch(actions, /read-only-committee"\]\)/);
});

test("ships database and HTTP defence in depth", async () => {
  const [migration, config] = await Promise.all([
    read("supabase/migrations/202608170001_security_hardening.sql"),
    read("next.config.ts"),
  ]);
  assert.match(migration, /ydsme_events_public_read/);
  assert.match(migration, /participants_workshop_member_unique/);
  assert.match(migration, /has_app_role/);
  assert.match(migration, /revoke all on public\.user_roles from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.user_roles to service_role/);
  assert.match(migration, /drop policy if exists "Enable update for committee and administrator"/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Permissions-Policy/);
});

test("keeps the supplied logo and local member login", async () => {
  const [shell, signIn, authActions] = await Promise.all([
    read("app/components/RailSite.tsx"),
    read("app/signin/page.tsx"),
    read("lib/actions/auth.ts"),
  ]);
  assert.match(shell, /\/ydsme-logo\.png/);
  assert.match(shell, /href="\/signin"/);
  assert.doesNotMatch(shell, /yorkmodelengineers\.co\.uk\/signin/);
  assert.match(signIn, /minLength=\{6\}/);
  assert.match(authActions, /existingPasswordSchema = z\.string\(\)\.min\(6\)/);
  assert.match(authActions, /newPasswordSchema = z\.string\(\)\.min\(8\)/);
});

test("publishes reviewed legal notices and original Society PDFs", async () => {
  const [shell, privacy, cookies, history, safetyPdf, historyPdf] = await Promise.all([
    read("app/components/RailSite.tsx"),
    read("app/privacy-policy/page.tsx"),
    read("app/cookie-policy/page.tsx"),
    read("app/club-history/page.tsx"),
    stat(new URL("public/documents/visitor-safety-guide.pdf", root)),
    stat(new URL("public/documents/ydsme-1929-1982.pdf", root)),
  ]);
  assert.match(shell, /Legal navigation/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /Vercel/);
  assert.match(privacy, /Stripe/);
  assert.match(privacy, /Cloudflare Turnstile/);
  assert.match(cookies, /does not use advertising or analytics cookies/);
  assert.match(history, /ydsme-1929-1982\.pdf/);
  assert.ok(safetyPdf.size > 300_000);
  assert.ok(historyPdf.size > 100_000);
});

test("keeps donation checkout server-side and administrator controlled", async () => {
  const [checkout, stripe, content, cards, webhook, migration, settings] = await Promise.all([
    read("lib/actions/donations.ts"),
    read("lib/stripe.ts"),
    read("lib/actions/content.ts"),
    read("app/components/DonationCards.tsx"),
    read("app/api/stripe/webhook/route.ts"),
    read("supabase/migrations/202608180002_donation_webhook.sql"),
    read("app/settings/page.tsx"),
  ]);
  assert.match(stripe, /process\.env\.STRIPE_SECRET_KEY/);
  assert.match(stripe, /import "server-only"/);
  assert.match(checkout, /amount: z\.coerce\.number\(\)\.min\(1\)\.max\(10_000\)/);
  assert.match(checkout, /checkout\.sessions\.create/);
  assert.match(checkout, /submit_type: "donate"/);
  assert.doesNotMatch(checkout, /payment_method_types/);
  assert.match(content, /saveDonationSettings[\s\S]*requireRole\(\["administrator"\]\)/);
  assert.match(cards, /startDonationCheckout/);
  assert.doesNotMatch(cards, /STRIPE_SECRET_KEY/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /webhooks\.constructEvent/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhook, /charge\.refunded/);
  assert.match(migration, /stripe_checkout_session_id text not null unique/);
  assert.match(migration, /alter table public\.donation_payments enable row level security/);
  assert.match(migration, /grant execute on function public\.target_donation_total_pence\(\) to service_role/);
  assert.doesNotMatch(content, /raised_pounds/);
  assert.doesNotMatch(settings, /Raised so far/);
});

test("keeps visitor bookings private, capacity-safe and staff verified", async () => {
  const [migration, actions, form, admin, data, email, ticket] = await Promise.all([
    read("supabase/migrations/202608180003_event_bookings.sql"),
    read("lib/actions/bookings.ts"),
    read("app/components/BookingForm.tsx"),
    read("app/admin/bookings/page.tsx"),
    read("lib/data.ts"),
    read("lib/booking-email.ts"),
    read("lib/booking-ticket.ts"),
  ]);
  assert.match(migration, /alter table public\.event_bookings enable row level security/);
  assert.match(migration, /revoke all on table public\.event_bookings from public, anon, authenticated/);
  assert.match(migration, /for update/);
  assert.match(migration, /reserved_places \+ p_party_size > selected_event\.booking_capacity/);
  assert.match(migration, /event_bookings_active_email_unique/);
  assert.match(actions, /TURNSTILE_SECRET_KEY/);
  assert.match(actions, /requireRole\(\["administrator", "committee"\]\)/);
  assert.match(actions, /create_event_booking/);
  assert.match(form, /useActionState/);
  assert.match(form, /referenceCode/);
  assert.match(admin, /checkInBooking/);
  assert.match(data, /available_places/);
  assert.match(email, /Idempotency-Key/);
  assert.match(email, /attachments/);
  assert.match(email, /content_id/);
  assert.match(email, /cid:\$\{ticket\.contentId\}/);
  assert.match(ticket, /TICKET_WIDTH = 1080/);
  assert.match(ticket, /TICKET_HEIGHT = 1920/);
  assert.match(ticket, /QRCode\.create/);
  assert.match(ticket, /shape-rendering="crispEdges"/);
  assert.match(ticket, /bookingVerificationUrl/);
  assert.doesNotMatch(email, /NEXT_PUBLIC_RESEND/);
});
