# Deployment rules

The application follows one promotion path: feature branch → `preview` → `main`. Vercel deploys only the persistent `preview` and `main` branches. A successful build is necessary, but it does not prove that the hosted Supabase schema is ready. Treat application deployment and database migration as two coordinated, separately verified operations.

## Required rules

1. Merge through pull requests in order: feature branches target `preview`, and only `preview` targets `main`. The `Validate promotion path` check rejects every other route.
2. Run `npm run verify` before merging and require the `Verify deployment` check when repository-plan settings allow required checks.
3. Do not merge with a failing code, build, or security-contract check. Feature branches do not deploy to Vercel; the merged result is reviewed at the stable `preview` deployment.
4. Delete feature branches after they merge into `preview`. The cleanup workflow does this automatically and explicitly preserves `preview` and `main`.
5. Never run seeds, fixtures, resets, or data-writing tests against remote Supabase. Data-writing tests must use the loopback stack at `http://127.0.0.1:54321`.
6. Database changes must use expand-and-contract deployment:
   - Expand: add and locally validate new tables, columns, views, policies, and grants without removing behavior used by the live application.
   - Migrate: apply the reviewed additive migration through the explicitly authorized production migration process before deploying code that requires it.
   - Deploy: release code that works with both the existing and expanded schema when practical. Public pages must degrade safely while an additive public projection is unavailable.
   - Verify: smoke-test the affected public and authenticated routes against production.
   - Contract: remove obsolete schema or compatibility code only in a later deployment after production verification.
7. Do not place production credentials in GitHub Actions, repository files, logs, or PR comments. `.env.prod` is for an explicitly authorized production deployment or read-only audit only.
8. Do not map a custom domain or consider a release complete until the production-alias smoke tests pass.
9. Scheduled data lifecycle work belongs to Supabase Cron. Quarantine file cleanup must use the `cleanup-quarantine` Edge Function and the Storage API; do not delete rows directly from `storage.objects`.

## Scheduled maintenance setup

Before applying `202608180021_event_management_lifecycle.sql` to a hosted project:

1. Create a dedicated Supabase secret API key for maintenance automation.
2. Store the project URL in Supabase Vault as `project_url` and the secret API key as `maintenance_secret_key`. Never put either value in a migration or repository file.
3. Deploy the `cleanup-quarantine` Edge Function. Its platform JWT check is disabled because Supabase Cron calls it service-to-service; the function itself accepts secret API keys only.
4. Apply the migration. It installs three staggered jobs: event archiving at 01:10 GMT, database retention at 02:17 GMT, and quarantine cleanup at 03:17 GMT.
5. Confirm the jobs in Supabase Cron and inspect their first run history. Invoke the Edge Function once with the maintenance secret key and verify that an audit record is written before considering the rollout complete.

## Release sequence

1. Review the PR diff, especially `supabase/migrations/`, authorization checks, public projections, and rollback behavior.
2. Create a feature branch from `preview`, then open a pull request back to `preview`.
3. Run `npm run verify` locally. GitHub CI runs the same command for pull requests and pushes to `preview` and `main`.
4. If the release contains a migration, validate it on the local Supabase stack and record the exact production migration and rollback plan in the PR.
5. Before merging code that requires new schema, explicitly authorize and apply the reviewed additive production migration. If migration timing must remain separate, the application needs a tested compatibility path for the old schema.
6. Merge the feature PR only after both GitHub checks pass, then smoke-test the stable `preview` deployment.
7. Open a `preview` to `main` pull request and merge it only after both checks pass.
8. Wait for the Vercel production deployment to report success.
9. Smoke-test these routes against the production alias:
   - `/`
   - `/events`
   - `/news`
   - `/signin`
10. Verify the feature-specific authenticated path after its schema is available. For announcements, verify `/admin/announcements` as an administrator or committee member.
11. If any critical public route returns a 5xx response, roll back the Vercel deployment or ship a narrowly scoped compatibility fix before continuing the database rollout.

## Rollback rule

Prefer rolling back application code before reversing a production migration. Database rollback must be explicitly reviewed because dropping or rewriting schema can destroy data. Additive migrations should normally remain in place while the application is rolled back to the last compatible deployment.
