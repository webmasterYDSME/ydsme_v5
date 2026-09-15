# Deployment rules

The application follows one promotion path: feature branch → `preview` → `main`. Git-triggered Vercel deployments are disabled. After a branch push passes GitHub CI, the `Release` workflow applies pending migrations, deploys the repository's Edge Functions to that branch's Supabase project, and only then calls its branch-specific Vercel deploy hook. This keeps application, function and database deployment ordered as one release operation.

## Repository ownership and local maintenance

The canonical repository is `webmasterYDSME/ydsme_v5`, connected to the YDSME
Vercel project `ydsme-v5`. Release jobs run only in this repository. The former
personal repository must no longer run its Release workflow after cutover,
because its deploy hooks and mirror job target the former deployment path.

This Mac uses the `github-ydsme` SSH alias with a separate authentication key.
The repository-local commit identity is `webmasterYDSME` with the account's
GitHub noreply address. Other projects retain their existing Git settings.
The old repository is retained as the `personal` remote for reference.

Continue using feature branch → `preview` → `main`, with reviewed pull requests.
Git SSH authentication is separate from the GitHub CLI login: `gh` must also be
authenticated as `webmasterYDSME` before using it to create or merge pull requests.
Do not rewrite historical commit authors to change ownership.

For the account cutover, configure the eight release secrets below in YDSME,
verify the Supabase project IDs and Vercel hook targets, and complete preview
verification before switching custom domains or retiring the former hosting.
Existing GitHub Actions secret values cannot be read back from the old repository;
retrieve them from their original secure storage or issue replacement credentials.

## Canonical site origin

Set production `NEXT_PUBLIC_SITE_URL` to `https://yorkmodelengineers.co.uk`,
matching Vercel's redirect destination. The legacy `www` value is normalized to
that origin for trusted application links and request checks. Incoming request
origins still require an exact match; arbitrary hosts are not trusted.
Keep local configuration on `http://localhost:3010` and preview configuration
on its own HTTPS origin. SEO uses the non-`www` production domain.

## Under Review / maintenance page

`MAINTENANCE_MODE` is an optional server-only environment flag. Set it to
`true` in the intended deployment environment to show the existing Under Review
page on every hostname. Leave it unset or set it to `false` for normal access,
including launch day. Only `true` (case-insensitive, ignoring surrounding spaces)
enables the gate; no hostname is special-cased.

After changing the flag in Vercel, redeploy that environment to apply it. Restart
local development after changing the local environment. No database setting or
migration is required.

The gate applies before sign-in, so administrators also see the holding page.
API routes, static assets, and `/under-review` remain available. Webhooks and
scheduled jobs continue to run: this flag does not pause billing or background
processing. The existing Under Review wording is retained for future use.

## Required rules

1. Merge through pull requests in order: feature branches target `preview`, and only `preview` targets `main`. The `Validate promotion path` check rejects every other route.
2. Run `npm run verify` before merging and inspect every GitHub check. The current GitHub plan cannot enforce required checks, so branch discipline remains an explicit team responsibility.
3. Do not merge with a failing promotion, migration-safety, source/build, database-integration, or browser check. Feature branches do not deploy to Vercel; the merged result is reviewed at the stable `preview` deployment.
4. Delete feature branches after they merge into `preview`. The cleanup workflow does this automatically and explicitly preserves `preview` and `main`.
5. Never run seeds, fixtures, resets, or data-writing tests against remote Supabase. Data-writing tests must use the loopback stack at `http://127.0.0.1:55321`.
6. Database changes must use expand-and-contract deployment. Existing migration files are immutable. The only exception is a separately reviewed replay repair that preserves the behaviour already applied to populated deployments and is required to make a fresh migration replay possible. Migrations containing `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, or `ALTER TABLE ... DROP COLUMN` are rejected from automatic release:
   - Expand: add and locally validate new tables, columns, views, policies, and grants without removing behavior used by the live application.
   - Migrate: apply the reviewed additive migration through the explicitly authorized production migration process before deploying code that requires it.
   - Deploy: release code that works with both the existing and expanded schema when practical. Public pages must degrade safely while an additive public projection is unavailable.
   - Verify: smoke-test the affected public and authenticated routes against production.
   - Contract: remove obsolete schema or compatibility code only in a later deployment after production verification.
7. Store hosted deployment credentials only as encrypted GitHub repository secrets. Never place their values in workflow source, repository files, logs, or PR comments. `.env.prod` remains for an explicitly authorized production deployment or read-only audit only.
8. Preview and production must use separate Supabase projects. The release script refuses identical project references and never includes seed data or writes Vault configuration. Bootstrap each project's environment-specific Vault values and Edge Function secrets once; subsequent releases deploy function code without copying secret values between projects.
9. Do not map a custom domain or consider a release complete until the production-alias smoke tests pass.
10. Scheduled data lifecycle work belongs to Supabase Cron. Quarantine file cleanup must use the `cleanup-quarantine` Edge Function and the Storage API; do not delete rows directly from `storage.objects`.

## Release automation setup

### Verify once, then promote

CI records the exact Git source tree after all selected checks pass. The preview
push, production PR and production push can reuse that successful verification
when their entire checked-out tree matches, including the PR merge result.
Branch names or matching commit messages are never sufficient.

- Only successful runs of this repository's CI workflow qualify; fork runs,
  failed runs, expired markers and insufficient test coverage do not.
- Markers expire after seven days. Reuse does not renew them. Missing evidence
  or a GitHub API problem runs fresh checks. Use GitHub’s “Re-run all jobs”
  action to force fresh checks for an existing run.
- Migration safety still runs against each promotion's change range. The final
  `CI complete` check rejects failed or unexpectedly skipped required jobs.
- Preview and production still build separately in Vercel using their own
  environment configuration. Vercel runs `npm run build`; lint and unit tests
  have already run in CI.
- Review the deployed preview before merging to main, then verify the production
  domain after deployment. Database migrations and Edge Functions still deploy
  before the application; this optimisation does not copy data between projects.

The first rollout has no reusable markers and runs the full checks. A change to
any file, including CI configuration or the dependency lockfile, changes the tree
and requires fresh verification. The marker lookup uses GitHub's read-only
[artifact metadata API](https://docs.github.com/en/rest/actions/artifacts);
it does not download or execute earlier build artifacts.

### CI scope for presentation changes

Every new source tree runs promotion validation, lint, unit/source-contract tests,
and the production build/type check. Changes confined to CSS/SCSS, static public
assets, Markdown, and the static `app/under-review/page.tsx` skip the isolated
Supabase/browser job. Other application pages may contain data access, so they
remain on the full path. Keep the holding page presentation-only; extend the
reviewed allowlist deliberately when extracting other static page components.

Migration safety runs for migration files and CI/tooling/test/dependency changes.
Backend, unknown, and CI configuration changes run the full integration checks.
PRs compare from their merge base; pushes compare the entire pushed range.
Deleted/renamed paths are included. Missing comparison history runs all checks.
The hosted release sequence remains unchanged: it checks pending migrations
before deploying, even after a presentation-only CI run.

Create two Vercel deploy hooks: one linked to `preview`, and one linked to `main`. Store their complete URLs as repository secrets; the URLs are credentials and must never appear in source or logs. Do not enable Vercel's automatic Git branch deployments because they would race the database migration.

Configure these GitHub repository secrets before merging the release workflow:

- `SUPABASE_PREVIEW_ACCESS_TOKEN`, `SUPABASE_PREVIEW_DB_PASSWORD`, `SUPABASE_PREVIEW_PROJECT_ID`
- `SUPABASE_PRODUCTION_ACCESS_TOKEN`, `SUPABASE_PRODUCTION_DB_PASSWORD`, `SUPABASE_PRODUCTION_PROJECT_ID`
- `VERCEL_PREVIEW_DEPLOY_HOOK`, `VERCEL_PRODUCTION_DEPLOY_HOOK`

The two project IDs must differ. A missing secret, a failed `supabase db push --dry-run`, a failed migration, a failed Edge Function deployment, or a rejected deploy hook fails closed: Vercel is not triggered. Supabase applies each pending migration once using its migration-history table. Never repair hosted migration history automatically; investigate and explicitly review any `migration repair` operation.

For the one-time rollout of this workflow, configure all secrets and hooks first, then promote the workflow to `main`. GitHub loads `workflow_run` definitions from the default branch, so the first preview release will not start until `release.yml` exists on `main`; rerun the latest successful preview CI workflow after that promotion.

## First administrator bootstrap

A fresh installation intentionally creates no default administrator and stores no privileged password in source or seed data. Apply the full migration chain first, then create and verify the intended administrator in Supabase Auth. Promote that existing Auth identity with the guarded one-time command:

```sh
npm run admin:bootstrap -- --email person@example.org
```

For a non-loopback Supabase project, repeat the exact API hostname as an explicit safety confirmation:

```sh
npm run admin:bootstrap -- --email person@example.org --confirm-host project-ref.supabase.co
```

The command refuses unverified accounts, refuses to create or invite an account, and stops permanently once any administrator role exists. It records the promotion in the audit log. After signing in, the first administrator must invite and assign one further active administrator through the normal member register before an existing populated installation crosses the role-migration safety gate. The website prevents either account from being demoted or archived until another active administrator has been assigned.

## Membership billing rollout

Keep `MEMBERSHIP_MODE=membermojo` until the membership migrations are applied, the notification function is deployed, and reconciliation is approved. Use `pilot` with `MEMBERSHIP_PILOT_EMAILS` for allowlisted end-to-end checks, `live` for public website membership, and `drain` to stop new applications, checkouts, reminders, and lapse automation while preserving officer recovery and signed webhook reconciliation. Configure separate Stripe test/live restricted keys, signed webhook secrets for the membership and donation endpoint registrations, and Customer Portal payment-method updates. Leave Stripe Tax disabled.

Store `project_url` and `maintenance_secret_key` in Supabase Vault as above, then deploy `deliver-membership-notifications`. Configure `RESEND_API_KEY`, `MEMBERSHIP_FROM_EMAIL`, `MEMBERSHIP_REPLY_TO` and `SITE_URL` as Edge Function secrets. Confirm that newly queued membership email is dispatched immediately and that the one-minute Supabase Cron recovery job succeeds. A missing Vault value is reported as `membership_notification_delivery_not_configured` rather than producing a request with a null URL.

In Stripe, create or let the officer plan screen create one Product per paid tier and immutable annual Prices. Set `STRIPE_RESTRICTED_KEY` and `STRIPE_MEMBERSHIP_WEBHOOK_SECRET` separately for preview and production; never copy sandbox identifiers into live plan rows. Reconcile plan prices, active paid MemberMojo rows, honorary candidates, shared/missing emails and portal links before switching the flag on. After enabling, replace live MemberMojo journeys and retain the imported source records read-only.

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
3. Run `npm run verify` locally. If Supabase is running on `http://127.0.0.1:55321`, also run `JOURNEY_TEST_PASSWORD=<local-test-password> npm run test:database` and `npm run test:browser`.
4. For a new tree requiring integration checks, GitHub CI starts a fresh, seedless local Supabase stack, applies every migration, runs the database contracts, builds the application, and runs Chromium smoke tests. Identical previously verified trees reuse the successful result. It never receives hosted Supabase credentials.
5. If the release contains a migration, record the exact production migration and rollback plan in the PR. High-risk destructive changes require a separately authorized manual rollout and cannot use the automatic release path.
6. Merge the feature PR only after all GitHub checks pass. A successful `preview` push CI run automatically applies pending preview migrations, deploys Preview Edge Functions and triggers the preview deploy hook.
7. Wait for the Vercel preview deployment to report success, then smoke-test the stable preview deployment.
8. Open a `preview` to `main` pull request and merge it only after all checks pass.
9. A successful `main` push CI run automatically applies pending production migrations, deploys Production Edge Functions, triggers the production deploy hook in the YDSME Vercel project.
10. Wait for the Vercel production deployment to report success.
11. Smoke-test these routes against the production alias:
   - `/`
   - `/events`
   - `/news`
   - `/membership`
   - `/signin`
12. Verify the feature-specific authenticated path after its schema is available. For announcements, verify `/admin/announcements` as an administrator or committee member.
13. If any critical public route returns a 5xx response, roll back the Vercel deployment or ship a narrowly scoped compatibility fix before continuing the database rollout.

## Rollback rule

Prefer rolling back application code before reversing a production migration. Database rollback must be explicitly reviewed because dropping or rewriting schema can destroy data. Additive migrations should normally remain in place while the application is rolled back to the last compatible deployment.
