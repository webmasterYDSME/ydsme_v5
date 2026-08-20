## Summary

Describe the user-visible change and why it is needed.

## Deployment checklist

- [ ] This PR follows the promotion path: feature branch → `preview`, or `preview` → `main`.
- [ ] `npm run verify` passes locally.
- [ ] Database changes pass `npm run test:database` against the loopback Supabase stack.
- [ ] Public routes remain usable if an additive database migration has not reached production yet.
- [ ] Any Supabase migration is additive and backward-compatible with the currently deployed application.
- [ ] Existing migration files are unchanged; every schema change has a new migration.
- [ ] The production migration and rollback steps are documented in the PR.
- [ ] No seed, fixture, reset, or data-writing test targets remote Supabase.
- [ ] After deployment, smoke-test `/`, `/events`, `/news`, `/membership`, and `/signin`.

If an item does not apply, mark it complete and explain why below.

## Migration and rollback notes

None.
