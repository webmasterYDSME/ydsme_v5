# York City & District Society of Model Engineers

A redesigned Next.js 16 website and secure Society portal, built for Vercel and connected to the existing Supabase project.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev -- --port 3010
```

Open [http://localhost:3010](http://localhost:3010).

Copy the keys listed in `.env.example` into `.env.local`. Never commit `.env.local`; it contains the Supabase service role and Stripe credentials.

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

The app-level hardening is active in code. The defence-in-depth RLS and Storage changes live at `supabase/migrations/202608170001_security_hardening.sql` and should be tested in a Supabase branch/local database before being applied to production.

## Vercel

Import this directory as a Vercel project, configure the variables from `.env.example`, and use the normal Next.js build command. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `TURNSTILE_SECRET_KEY` as public variables.
