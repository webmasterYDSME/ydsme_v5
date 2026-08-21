# York City & District Society of Model Engineers

A redesigned Next.js 16 website and secure Society portal, built for Vercel. Local development uses an isolated Docker-based Supabase stack; production can use the hosted Supabase project through Vercel environment variables.

## Local development

Requirements: Node.js 22.13 or newer and Docker Desktop.

```bash
npm install
npm run supabase:start
npm run dev -- --port 3010
```

Open the website at [http://localhost:3010](http://localhost:3010), local Supabase Studio at [http://127.0.0.1:55323](http://127.0.0.1:55323), and captured local email at [http://127.0.0.1:55324](http://127.0.0.1:55324).

Copy the keys listed in `.env.example` into `.env.local`. Never commit `.env.local`. Run `npm run supabase:status` to retrieve the local API URL and local-only keys. Stripe, Facebook, production SMTP and production webhooks should remain disabled during local development.

Set `MEMBERSHIP_MODE` to `membermojo`, `pilot`, `live`, or `drain`. `membermojo` keeps all public journeys on MemberMojo; `pilot` enables allowlisted website journeys; `live` enables the public platform; and `drain` stops new applications and financial automation while retaining officer recovery and signed webhook reconciliation.

`npm run supabase:start` also installs local-only Vault values used by scheduled jobs. Membership emails are sent to Mailpit immediately after they are queued; a one-minute job retries any delivery interrupted by a transient failure.

The local database currently contains a private production snapshot for development. Its ignored export files live under `supabase/.temp/`; never commit, upload or share them. `supabase db reset` erases the local snapshot and rebuilds only the schema because automatic production-data seeding is intentionally disabled.

## Main routes

- Public: `/`, `/visitors`, `/events`, `/club-history`, `/committees`, `/membership`
- Public event booking: `/events/[id]/book`
- Authentication: `/signin`, `/reset-password`, `/auth/callback`
- Members: `/dashboard`, `/dashboard/workbench`, `/dashboard/minutes`, `/dashboard/publications`, `/dashboard/resources`, `/account`
- Committee: `/admin/events`, `/admin/bookings`, `/admin/workshops`
- Administrator: `/admin/members`, `/settings`

Public events and committee members load from Supabase. Member-only events are only rendered inside the authenticated dashboard.

Public events can optionally use capacity-limited booking. Configure `RESEND_API_KEY` and a verified `BOOKINGS_FROM_EMAIL` sender to deliver confirmations; the booking and reference are still recorded if email delivery is temporarily unavailable. Each confirmation includes a unique 1080 × 1920 mobile PNG ticket, both inline and attached, with an event-specific design and a QR code that opens the protected staff lookup. Site control can search references and check groups in at `/admin/bookings`.

The member-only Project Workbench lets active members create project journals, add private photographs and progress updates, request practical help, follow projects and discuss work with other members. Project images are kept in a private Storage bucket and delivered through short-lived signed links.

## Access model

- `administrator`: full access, including membership and committee records
- `committee`: events, workshops, documents and member notices
- `read-only-committee`: review management screens without write access
- `member`: dashboard, private timetable, documents, workshop reservations and own account
- anonymous: public pages and public events only

Every Server Action verifies the Supabase user and required database role. Next.js Proxy provides an early redirect but is not relied on as the authorization boundary. See [SECURITY.md](./SECURITY.md).

## Verification

```bash
npm run lint
npm test
npm audit
```

`npm test` runs a full production build followed by security-contract tests.

## Database migration

The original migration history and the defence-in-depth RLS and Storage migration live under `supabase/migrations/`. They have been applied and tested against the local database only. The hardening migration must not be applied to production until every application role has been validated.

## Vercel

Import this directory as a Vercel project, configure the variables from `.env.example`, and use the normal Next.js build command. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `TURNSTILE_SECRET_KEY` as public variables.
