# York City & District Society of Model Engineers

A redesigned Next.js 16 website and secure Society portal, built for Vercel. Local development uses an isolated Docker-based Supabase stack; production can use the hosted Supabase project through Vercel environment variables.

## Local development

Requirements: Node.js 22.13 or newer and Docker Desktop.

```bash
npm install
npm run supabase:start
npm run dev -- --port 3010
```

Open the website at [http://localhost:3010](http://localhost:3010), local Supabase Studio at [http://127.0.0.1:54323](http://127.0.0.1:54323), and captured local email at [http://127.0.0.1:54324](http://127.0.0.1:54324).

Copy the keys listed in `.env.example` into `.env.local`. Never commit `.env.local`. Run `npm run supabase:status` to retrieve the local API URL and local-only keys. Stripe, Facebook, production SMTP and production webhooks should remain disabled during local development.

The local database currently contains a private production snapshot for development. Its ignored export files live under `supabase/.temp/`; never commit, upload or share them. `supabase db reset` erases the local snapshot and rebuilds only the schema because automatic production-data seeding is intentionally disabled.

## Main routes

- Public: `/`, `/visitors`, `/events`, `/club-history`, `/committees`, `/membership`
- Authentication: `/signin`, `/reset-password`, `/auth/callback`
- Members: `/dashboard`, `/dashboard/minutes`, `/dashboard/publications`, `/dashboard/resources`, `/account`
- Committee: `/admin/events`, `/admin/workshops`
- Administrator: `/admin/members`, `/settings`

Public events and committee members load from Supabase. Member-only events are only rendered inside the authenticated dashboard.

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
