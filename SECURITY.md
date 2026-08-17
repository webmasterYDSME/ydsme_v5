# Security model

The public website and member portal share Supabase, but use separate access paths.

- Public event queries always filter to `event_type = public`.
- Next.js `proxy.ts` verifies Supabase claims and refreshes cookies. It is only an early route guard; protected pages and every Server Action perform their own identity/role check.
- Server authorization reads the current role from `user_roles` after Supabase verifies the user. UI visibility is never treated as authorization.
- The service role is imported only by server-only modules and is used only after an authorization check.
- Content writes allow `administrator` and `committee`. `read-only-committee` can inspect management screens but cannot mutate data. Member and committee administration is administrator-only.
- Uploaded event images are restricted to common image formats and 8 MB. Documents are PDF-only and restricted to 12 MB.
- Redirect destinations are restricted to same-origin relative paths.

## Database hardening

`supabase/migrations/202608170001_security_hardening.sql` tightens RLS and Storage policies. Apply it through a Supabase branch/local database first, validate each role, then promote it to production. It intentionally is not run automatically by the application.

## Vercel environment

Configure the variables listed in `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, and `STRIPE_SECRET_KEY` must remain server-only and must never use a `NEXT_PUBLIC_` prefix.
