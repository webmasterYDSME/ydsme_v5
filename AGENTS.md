<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase data safety

- Treat every non-loopback Supabase endpoint as production data.
- Never run seeds, fixtures, database resets, or test-data scripts against a remote Supabase project.
- Data-writing tests must obtain their endpoint from `supabase status -o env` and refuse anything other than `http://127.0.0.1:55321`.
- Keep `.env.local` pointed at the local Supabase stack. `.env.prod` is the remote configuration and must be used only for deployment or explicitly authorized, read-only auditing.

## Membership officer handbook

- The handbook is written in code at `lib/handbook/chapters/*.ts` and shown at `/admin/handbook`. When you change a membership screen, button label, rule, date, fee, email or import behaviour, update the chapter that describes it and set its `reviewed` date.
- Add a chapter by creating a file in `lib/handbook/chapters/` (types only, no other imports) and listing it in `lib/handbook/index.ts`. `tests/handbook.test.mjs` checks every chapter, every internal link and that key features are still covered.

## Who runs membership (MemberMojo or the website)

- This is a database setting an administrator changes at `/administrator/membership-mode`, not an environment variable. Read it only through `lib/features.ts` in the web app (`membershipBillingEnabled()`, `membershipAdministrationEnabled()`, `membershipRecoveryEnabled()`, `membershipMode()`) and through `rpc("membership_mode")` in edge functions or SQL (`public.membership_mode()`).
- Every one of those checks is **async and must be awaited**: an un-awaited Promise is always truthy and would switch the website on. `tests/membership-mode.test.mjs` fails on any call without `await`.
- Only `public.set_membership_mode()` changes it. Local tests and journeys that need the website mode set it with `holdLocalMembershipMode("website")` from `tests/local-supabase.mjs`, or with a rolled-back `update public.membership_mode_settings ... where id`.
