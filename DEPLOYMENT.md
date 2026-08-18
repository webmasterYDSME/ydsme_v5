# Deployment rules

The application is deployed to Vercel from `main`. A successful build is necessary, but it does not prove that the hosted Supabase schema is ready. Treat application deployment and database migration as two coordinated, separately verified operations.

## Required rules

1. Merge through a pull request. Run `npm run verify` before merging and require the `Verify deployment` check when repository-plan settings allow required checks.
2. Do not merge with a failing code, build, or security-contract check. A Vercel preview rejected only because its commit author lacks project access must be recorded in the PR; it is not a substitute for the repository verification check.
3. Never run seeds, fixtures, resets, or data-writing tests against remote Supabase. Data-writing tests must use the loopback stack at `http://127.0.0.1:54321`.
4. Database changes must use expand-and-contract deployment:
   - Expand: add and locally validate new tables, columns, views, policies, and grants without removing behavior used by the live application.
   - Migrate: apply the reviewed additive migration through the explicitly authorized production migration process before deploying code that requires it.
   - Deploy: release code that works with both the existing and expanded schema when practical. Public pages must degrade safely while an additive public projection is unavailable.
   - Verify: smoke-test the affected public and authenticated routes against production.
   - Contract: remove obsolete schema or compatibility code only in a later deployment after production verification.
5. Do not place production credentials in GitHub Actions, repository files, logs, or PR comments. `.env.prod` is for an explicitly authorized production deployment or read-only audit only.
6. Do not map a custom domain or consider a release complete until the production-alias smoke tests pass.

## Release sequence

1. Review the PR diff, especially `supabase/migrations/`, authorization checks, public projections, and rollback behavior.
2. Run `npm run verify` locally. GitHub CI runs the same command for pull requests and pushes to `main`.
3. If the release contains a migration, validate it on the local Supabase stack and record the exact production migration and rollback plan in the PR.
4. Before merging code that requires new schema, explicitly authorize and apply the reviewed additive production migration. If migration timing must remain separate, the application needs a tested compatibility path for the old schema.
5. Merge the PR only after the repository verification check passes.
6. Wait for the Vercel production deployment to report success.
7. Smoke-test these routes against the production alias:
   - `/`
   - `/events`
   - `/news`
   - `/signin`
8. Verify the feature-specific authenticated path after its schema is available. For announcements, verify `/admin/announcements` as an administrator or committee member.
9. If any critical public route returns a 5xx response, roll back the Vercel deployment or ship a narrowly scoped compatibility fix before continuing the database rollout.

## Rollback rule

Prefer rolling back application code before reversing a production migration. Database rollback must be explicitly reviewed because dropping or rewriting schema can destroy data. Additive migrations should normally remain in place while the application is rolled back to the last compatible deployment.
