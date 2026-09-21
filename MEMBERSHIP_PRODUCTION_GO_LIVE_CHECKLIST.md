# Membership production go-live checklist

This checklist governs the replacement of MemberMojo by the website membership platform. The platform must remain in `membermojo` mode until every launch gate marked **Required** has passed and the named approvers have signed the release record.

> **Update, 19 September 2026.** There are now only two modes: `membermojo` and `website`. Wherever this checklist says `pilot` or `live`, read `website`; wherever it says `drain` or an emergency fallback, read `membermojo` (public apply, checkout and renew go to MemberMojo and the membership area is hidden). MemberMojo's list is brought in with Administrator > Import MemberMojo list, which reads only name, email and the Membership column and makes everyone in the file a full member for the current year.

## Readiness decision

**Current decision (21 August 2026): NO-GO.**

The implementation is suitable for controlled preview and pilot testing, but it is not yet safe to replace MemberMojo in production. The current production audit found undeployed routes, unapplied database migrations, missing or invalid live Stripe configuration, no imported membership records, and incomplete end-to-end production verification.

Do not switch the Membership system to the website merely because the application builds or a single payment succeeds. Go-live requires financial reconciliation, entitlement integrity, portal isolation, notification delivery, recovery testing, and an approved rollback rehearsal.

## Current production snapshot

| Area | Current state | Launch status |
| --- | --- | --- |
| Rollout mode | Membership system: MemberMojo | Safe holding state |
| Public membership route | `/membership` returns 404 after the production redirect | Blocked |
| Stripe webhook route | `/api/stripe/webhook` returns 404 after the production redirect | Blocked |
| Resend webhook route | `/api/resend/webhook` returns 404 after the production redirect | Blocked |
| Database migrations | 28 local membership migrations are not applied remotely (`202608200023`–`202608200036` and `202608210001`–`202608210014`) | Blocked |
| Canonical membership data | No production members, applications, terms, payments, subscriptions, or notifications | Migration not run |
| Stripe plan mapping | Production Product and Price IDs are empty for every paid tier/year | Blocked |
| Vercel Stripe credentials | Restricted key and membership webhook secret are absent; existing secret and publishable values did not validate as recognised Stripe keys | Blocked |
| Supabase Stripe credentials | No production Stripe key is configured for provider commands | Blocked |
| Resend configuration | API key, sender, reply-to, and webhook secret are present, but the deployed webhook route is absent | Partially ready |
| Mailpit | `LOCAL_MAILPIT_URL` has been removed from preview and production Supabase | Complete |
| MemberMojo cutover | Final import, reconciliation, and conflict approval have not occurred | Blocked |

Re-run this audit immediately before release; do not rely on this snapshot as proof of current state.

## 1. Release ownership and change control — Required

- [ ] Name the release owner responsible for the whole cutover.
- [ ] Name the membership-officer approver for member records, tiers, honorary cases, and shared addresses.
- [ ] Name the treasurer approver for fees, opening balances, Stripe totals, and offline payments.
- [ ] Name the technical approver for deployment, security, webhooks, recovery, and monitoring.
- [ ] Agree the cutover date, support window, and a period when officers will not edit MemberMojo.
- [ ] Announce the MemberMojo data-entry freeze to every officer who can change records.
- [ ] Record the exact Git commit and release version being promoted.
- [ ] Review all production migration and rollback notes before approval.
- [ ] Confirm a recent, restorable production database backup exists.
- [ ] Confirm who is authorised to enter `pilot`, `live`, and emergency `drain` modes.

## 2. Preview exit gate — Required

- [ ] Deploy the exact release candidate to the stable preview environment.
- [ ] Apply every pending migration to preview through the approved release workflow.
- [ ] Deploy `deliver-membership-notifications` and every required Edge Function to preview.
- [ ] Use a Stripe sandbox dedicated to preview; do not reuse local or production credentials.
- [ ] Replace and revoke any preview credential exposed during setup or testing.
- [ ] Verify preview Product and Price IDs belong to the preview Stripe account.
- [ ] Verify the preview webhook signature with a real Stripe test event.
- [ ] Verify the Resend delivery webhook with accepted, delivered, bounced, and suppressed test events.
- [ ] Complete all automated tests listed in section 10 against a fresh local stack.
- [ ] Complete all preview journeys listed in section 11 without direct database corrections.
- [ ] Resolve every preview checkout, webhook, provider-command, notification, and payment-review failure.
- [ ] Record pilot defects and confirm every launch-blocking defect is closed and retested.

## 3. Production application and database — Required

- [ ] Keep production's Membership system on MemberMojo during schema and code deployment.
- [ ] Confirm preview and production use different Supabase project references.
- [ ] Review `supabase db push --dry-run` output against production.
- [ ] Apply all pending additive migrations using the approved release workflow.
- [ ] Confirm the remote migration history exactly matches the release commit.
- [ ] Deploy all production Edge Functions before deploying application code that depends on them.
- [ ] Deploy the application and confirm `/membership` loads while still showing the MemberMojo journey.
- [ ] Confirm `/api/stripe/webhook` exists and rejects unsigned requests.
- [ ] Confirm `/api/resend/webhook` exists and rejects invalid signatures.
- [ ] Confirm `/admin/memberships` is inaccessible without an authenticated officer capability.
- [ ] Confirm database functions, scheduled jobs, outboxes, leases, and stale-claim recovery are installed.
- [ ] Confirm RLS is enabled on every member, application, term, payment, subscription, notification, audit, report, and migration-review table.
- [ ] Confirm no seed, fixture, reset, or data-writing test has run against production.

## 4. Production environment and secrets — Required

Never paste secret values into this checklist, commits, logs, screenshots, or support messages. Record only the provider entry name, creation date, and the person who verified it.

### Vercel production

- [ ] The Membership system (Administrator > Membership system) is on MemberMojo before deployment and migration.
- [ ] The website is switched on only in an isolated local or preview environment with its own database, until sections 1–11 have passed.
- [ ] `NEXT_PUBLIC_SITE_URL=https://yorkmodelengineers.co.uk` and redirects preserve secure links.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a valid live publishable key for the production Stripe account.
- [ ] `STRIPE_RESTRICTED_KEY` is a newly created live restricted key with only the permissions required by the website.
- [ ] `STRIPE_MEMBERSHIP_WEBHOOK_SECRET` matches only the production membership webhook endpoint.
- [ ] Remove obsolete or invalid `STRIPE_SECRET_KEY` and legacy membership webhook variables after compatibility is confirmed.
- [ ] `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MEMBERSHIP_FROM_EMAIL`, and `MEMBERSHIP_REPLY_TO` are present and valid.
- [ ] Supabase URL, anonymous key, service-role key, Turnstile keys, and rate-limit secrets are present and environment-correct.
- [ ] Redeploy after every environment-variable change and verify the deployed version sees it.

### Supabase production

- [ ] Configure a separate live restricted Stripe key for subscription/provider commands.
- [ ] Configure `RESEND_API_KEY`, sender, reply-to, `SITE_URL`, project URL, and maintenance secret in the appropriate secret store/Vault.
- [x] Remove `LOCAL_MAILPIT_URL`; production must never route mail to a developer Mailpit instance.
- [ ] Confirm secret access is limited to the functions that require it.
- [ ] Confirm secret values are not present in migrations, database rows, logs, or client bundles.

## 5. Stripe live configuration — Required

- [ ] Confirm Stripe production business identity, settlement bank account, statement descriptor, support details, and receipt settings.
- [ ] Confirm the account is operating in live mode and no sandbox identifier is used in production.
- [ ] Create one live Product for each paid tier: Junior, Student, Adult, and Concession.
- [ ] Create immutable annual live Prices for the effective membership year and next renewal year.
- [ ] Record the live Product and Price IDs through the officer plan workflow or approved data operation.
- [ ] Independently verify every displayed fee against the Society-approved fee schedule.
- [ ] Leave Stripe Tax/automatic tax disabled unless the Society has separately approved tax registration and treatment.
- [ ] Configure the Customer Portal for payment-method updates only.
- [ ] Register the production webhook at `https://yorkmodelengineers.co.uk/api/stripe/webhook`.
- [ ] Subscribe the endpoint to all application-supported Checkout, subscription, invoice, refund, and dispute events.
- [ ] Confirm the webhook signing secret is unique to this endpoint.
- [ ] Verify restricted-key permissions using Checkout creation, Customer access, subscription changes, Prices, Products, and refunds/disputes read paths as applicable.
- [ ] Confirm website and Supabase automation use separate restricted keys so either can be revoked independently.
- [ ] Verify automatic renewal cancellation, resumption, future Price transition, and offline-payment cancellation through the provider-command queue.
- [ ] Verify full refunds, partial refunds below the term fee, open disputes, won disputes, and lost disputes reach the correct review state.
- [ ] Confirm duplicate successful payments cannot create duplicate terms.

## 6. Email and notification delivery — Required

- [ ] Verify the membership sender domain and visible From/Reply-To addresses in Resend.
- [ ] Register the production delivery webhook at `https://yorkmodelengineers.co.uk/api/resend/webhook`.
- [ ] Confirm webhook signature validation and event persistence.
- [ ] Send a real production-mode message to controlled internal addresses and verify accepted and delivered states.
- [ ] Test hard bounce, complaint/suppression handling, retry backoff, exhausted retry alert, and officer correction/retry.
- [ ] Confirm application verification emails are dispatched promptly and are not dependent on a long cron interval.
- [ ] Confirm activation and portal access are consolidated into one message when portal access is available.
- [ ] Confirm cash, bank-transfer, and cleared-cheque activation messages explain portal access or why a unique login email is still required.
- [ ] Confirm every shared-mailbox message names the member concerned and reveals no other person at that address.
- [ ] Confirm Junior guardian copies are clearly labelled and stop under the agreed transition-at-18 rules.
- [ ] Confirm notification deduplication includes member/application identity, not only the recipient address.
- [ ] Confirm obsolete reminders are cancelled after payment, honorary activation, rejection, or lapse resolution.
- [ ] Confirm essential membership messages remain separate from optional newsletter consent and unsubscribe handling.
- [ ] Verify the officer daily digest and urgent payment/webhook/delivery alerts.

## 7. MemberMojo final migration and reconciliation — Required

- [ ] Export the final complete MemberMojo CSV after the agreed data-entry freeze.
- [ ] Store the source export securely with access and retention controls.
- [ ] Record export timestamp, source row count, file checksum, and importing officer.
- [ ] Run the final import exactly once and confirm repeat-import refusal.
- [ ] Preserve every MemberMojo external ID and source date as read-only provenance.
- [ ] Create each valid person as a separate member even when contact emails are shared.
- [ ] Never merge or link members solely by email address.
- [ ] Reconcile total source rows to imported, rejected, duplicated, inactive, honorary-candidate, and review rows.
- [ ] Reconcile active paid members by tier and membership year.
- [ ] Reconcile expected opening financial totals to imported paid terms without fabricating payments.
- [ ] Review every shared-email group and record either unique portal identities or an audited correspondence-only decision.
- [ ] Review every email that matches an existing Auth account; link only when individual ownership is unambiguous.
- [ ] Review missing-email members and confirm officer-managed status.
- [ ] Review suspected duplicates using external ID, name, DOB, telephone, and provenance; do not silently merge.
- [ ] Review every honorary/life candidate and explicitly grant, reject, or defer it with an audit reason.
- [ ] Review unknown or conflicting membership types and assign the correct plan.
- [ ] Review conflicting portal links and prove that one login cannot see another member.
- [ ] Verify migrated current terms, joined dates, statuses, and grace/lapse dates using a sample plus aggregate totals.
- [ ] Confirm all unresolved entitlement, identity, honorary, financial, and portal conflicts are zero before `live`.
- [ ] Obtain membership-officer and treasurer sign-off on the reconciliation report.

## 8. Security, privacy, and audit — Required

- [ ] Run the repository security audit against the release commit and resolve all high/critical findings.
- [ ] Search the repository and build output for exposed Stripe, Supabase, Resend, maintenance, and webhook secrets.
- [ ] Rotate any secret that appeared in browser automation output, logs, screenshots, shell history, or chat.
- [ ] Verify public application responses do not disclose whether an email already exists.
- [ ] Verify every application, guardian, checkout, contact-change, and status token is hashed, scoped, expiring, and single-purpose.
- [ ] Verify rate limiting and Turnstile on public application entry points.
- [ ] Verify login ownership uses `members.auth_user_id = auth.uid()` and is never inferred from email.
- [ ] Test two users with a shared contact email and prove mutual isolation for profile, terms, payments, notifications, honorary history, and reports.
- [ ] Verify service-role queries cannot populate another member's account inbox.
- [ ] Verify officer capability checks on every server action, API route, and database function, not only in the interface.
- [ ] Verify archived/deleted officer accounts do not erase financial, honorary, consent, or audit attribution.
- [ ] Verify suspension and archival override paid and honorary access without deleting history.
- [ ] Verify DOB and guardian data are absent from public responses, logs, Stripe metadata beyond what is required, and email content unless necessary.
- [ ] Verify payment credentials are never stored and legacy `users.payment_method` data is unused.
- [ ] Verify financial corrections void and replace records; immutable history is not edited.
- [ ] Verify all officer decisions requiring a reason create immutable audit evidence.
- [ ] Verify report downloads require officer capability, expire safely, and contain only requested data.
- [ ] Review retention periods, legal holds, deletion/anonymisation jobs, and financial-record retention with the Society's responsible officer.
- [ ] Confirm privacy notice, terms, Club Rules link/request wording, newsletter preference, and data-subject contact route are accurate.

## 9. Financial and lifecycle correctness — Required

- [ ] Verify all four annual fees against approved values and effective years.
- [ ] Verify initial proration for every calendar month, inclusive-month handling, December next-year handling, and penny rounding.
- [ ] Verify the applicant sees the exact immediate charge and the exact 1 January renewal amount/date before Checkout.
- [ ] Verify “You can cancel anytime from your Account” matches actual cancellation behaviour.
- [ ] Verify renewals open on 1 November and always use the full next-year annual fee.
- [ ] Verify auto-renew charges on 1 January and cancelled subscriptions end at the paid boundary.
- [ ] Verify grace begins on 1 January, access continues through the last day of February, and lapse occurs at 00:00 Europe/London on 1 March.
- [ ] Verify late post-lapse renewal restores the correct term without incorrect proration.
- [ ] Verify Junior-to-Adult, Student-to-Adult, and Adult-to-Concession transitions use next-year age and advance notice.
- [ ] Verify an 18–24 member defaults to Adult and a Student request blocks payment pending approval.
- [ ] Verify DOB corrections alter only unpaid future transitions and preserve paid history.
- [ ] Verify annual fees carry forward automatically unless an officer changes a future fee.
- [ ] Verify fee changes invalidate stale Checkout sessions and show the revised amount for renewed consent.
- [ ] Verify plan unavailability blocks payment and creates an officer reassignment task.
- [ ] Verify cash, bank transfer, and cleared cheque accept exact full payments only, reject future receipt dates, and record immutable references.
- [ ] Verify an uncleared cheque pauses application expiry but does not activate membership.
- [ ] Verify recording an offline future term cancels online renewal before it can double-charge.
- [ ] Verify active honorary status creates no payment or invoice and suppresses renewal, grace, lapse, and payment reminders.
- [ ] Verify scheduled honorary grants, already-paid future-term review, revocation requirements, mid-year transition, and 1 January transition.

## 10. Automated verification — Required

Run these against the release commit. Database-writing tests must use only the local Supabase endpoint `http://127.0.0.1:55321`.

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test:unit`
- [ ] `npm run test:database`
- [ ] `npm run test:browser`
- [ ] `npm run test:membership-journeys`
- [ ] `npm run test:stripe-membership`
- [ ] Confirm the test runner refuses a non-loopback Supabase endpoint for data-writing tests.
- [ ] Run webhook replay, duplicate delivery, out-of-order delivery, and stale-lease recovery tests.
- [ ] Run concurrent Checkout creation, concurrent offline confirmation, and duplicate successful-payment tests.
- [ ] Run accessibility checks for membership, application, checkout/status, account, and officer pages.
- [ ] Verify responsive layouts at phone, tablet, desktop, large desktop, zoomed text, and keyboard-only navigation.
- [ ] Archive test output and the exact commit SHA as release evidence.

## 11. Mandatory preview/pilot journeys — Required

Complete each journey from the browser and verify the database, Stripe state, officer queue, email, portal, and audit result. Do not mark a journey complete based only on the success page.

### New online members

- [ ] Adult, unique email, automatic renewal on.
- [ ] Adult, unique email, automatic renewal switched off before Checkout.
- [ ] Adult, abandoned verification, resend, expired link, and successful recovery.
- [ ] Adult, abandoned Checkout, reminder, reused/open-session behaviour, expired session, and reissue.
- [ ] Student, officer approval, successful payment, portal access, and renewal.
- [ ] Student rejection with neutral status handling and no payment access.
- [ ] Junior with distinct applicant and guardian emails, separate verification/consent, approval, payment, and guardian notices.
- [ ] Guardian-led Junior using one guardian mailbox and one combined verification/consent action, with no Junior portal linked to the guardian login.
- [ ] Concession, approval, successful payment, portal access, and renewal.
- [ ] December application with immediate access and the following year's full term.

### Shared-email and portal ownership

- [ ] Two different Adults apply using the same contact email and receive distinct member-named messages, payments, terms, and receipts.
- [ ] A repeat submission matching email, name, and DOB resumes/reviews the existing application without a second charge.
- [ ] One shared-email member receives a portal; the other remains correspondence-only.
- [ ] The portal-enabled member cannot access the other person's data.
- [ ] Assign a later unique login email to the second member and verify invitation and isolation.
- [ ] Change one member's shared correspondence address without changing either portal login.
- [ ] Verify a hard bounce or newsletter unsubscribe at the shared address behaves as designed without merging member records.

### Officer-created and offline members

- [ ] Adult without email, officer-created, cash paid, no portal.
- [ ] Junior without personal email, documented guardian consent, officer-created, offline paid, no guardian-login portal assignment.
- [ ] Exact cash payment and receipt/audit evidence.
- [ ] Bank transfer pending then confirmed.
- [ ] Cheque received, uncleared pause, cleared activation, and failed/void replacement.
- [ ] Payment amount mismatch and future receipt-date rejection.
- [ ] Later addition and verification of a unique portal login email.

### Renewals and recovery

- [ ] Auto-renew successful on 1 January.
- [ ] Payment action required, failure, recovery, and consolidated grace messaging.
- [ ] Manual renewal by Stripe, cash, bank transfer, and cleared cheque.
- [ ] Offline renewal disables a pending online renewal.
- [ ] Grace access during January and February, 1 March lapse, and late reinstatement.
- [ ] Price change at renewal without proration or historical-price mutation.
- [ ] Subscription cancellation, resumption while it exists, and new Checkout after cancellation.
- [ ] Duplicate Checkout completion, refund, partial refund, dispute opened, dispute won, and dispute lost.
- [ ] Webhook endpoint unavailable then replay/recovery without duplicate entitlement.
- [ ] Provider command fails then retries and clears its officer alert.

### Honorary, suspension, and archival

- [ ] Create a new Lifetime Honorary member without an application or payment.
- [ ] Schedule honorary status for an existing paid member at the next membership year.
- [ ] Cancel Stripe renewal at the correct boundary without refunding prior payment.
- [ ] Create payment review when a future term is already paid.
- [ ] Activate honorary status and confirm reminders/lapse jobs skip the member.
- [ ] Revoke with required reason, replacement tier, and effective date.
- [ ] Verify 1 January and mid-year honorary-to-paid transitions.
- [ ] Suspend and restore paid and honorary members without erasing history.
- [ ] Archive an officer who made decisions and confirm attribution remains readable.

### Reporting and retention

- [ ] Generate the bookkeeping/legal ZIP and verify manifest, filters, row counts, financial totals, timestamps, and all required files.
- [ ] Verify reports correctly represent shared contact groups and independent members.
- [ ] Verify report generation is asynchronous, access-controlled, and recoverable after failure.
- [ ] Rehearse application retention, former-member retention, financial/audit retention, legal hold, and shared-address anonymisation rules.

## 12. Production pilot — Required

- [ ] Switch the production Membership system to the website only after sections 1–11 have passed.
- [ ] Use named, controlled pilot addresses; do not use existing members without an agreed test/reset plan.
- [ ] Confirm non-allowlisted visitors still receive the MemberMojo journey and cannot create website payments.
- [ ] Complete at least one approved live low-risk payment using a controlled real member/test participant and reconcile it to Stripe settlement records.
- [ ] Complete one officer-confirmed offline payment.
- [ ] Verify real delivery events, portal invitation, account isolation, notification inbox, audit trail, and report export.
- [ ] Observe the system for the agreed pilot period and resolve every warning or failure.
- [ ] Confirm no unexplained differences between Stripe, membership payments, membership terms, and bookkeeping totals.
- [ ] Rehearse switching from `pilot` to `drain` and confirm no new applications/checkouts/reminders are created while reconciliation continues.
- [ ] Return to `pilot` only after confirming recovery behavior.

## 13. Final go-live approval — Required

Every item below must be true at the same decision meeting.

- [ ] All required checklist items are complete, or an explicitly accepted non-critical exception is documented below.
- [ ] All automated checks pass on the exact production release commit.
- [ ] Zero unresolved entitlement, identity, honorary, portal-ownership, migration, or duplicate-payment conflicts.
- [ ] Zero unexplained financial reconciliation differences.
- [ ] No high/critical security finding remains open.
- [ ] Stripe and Resend health checks are green and no exhausted retry is unresolved.
- [ ] The final MemberMojo import and reconciliation are signed by the membership officer and treasurer.
- [ ] Support coverage, monitoring dashboards, and emergency contacts are active.
- [ ] The rollback/drain procedure has been rehearsed and its authorised operator is available.
- [ ] Take and record a final backup/recovery point.
- [ ] Import the latest MemberMojo list, then switch the Membership system to the website (the readiness checks must show nothing to fix, and any warning is accepted with a recorded reason).
- [ ] Confirm MemberMojo links/copy are removed only after the live deployment passes smoke tests.
- [ ] Preserve MemberMojo source and import records read-only under the approved retention rules.

## 14. Immediate post-launch checks

### First 30 minutes

- [ ] Verify `/membership`, `/membership/apply`, `/signin`, `/account`, and `/admin/memberships` on the production alias.
- [ ] Verify a public visitor sees the website application and no MemberMojo application link remains.
- [ ] Verify unsigned Stripe and Resend webhook requests are rejected.
- [ ] Verify payment-system health shows ready when no failures exist.
- [ ] Watch application errors, database errors, webhook failures, provider-command failures, notification retries, and rate-limit/Turnstile failures.

### First business day

- [ ] Reconcile every Stripe Checkout/payment to one application, member, payment, and term.
- [ ] Reconcile every offline confirmation to its receipt/reference and officer audit record.
- [ ] Review abandoned verifications/checkouts without manually exposing whether an email exists.
- [ ] Review all shared-email and portal-access outcomes.
- [ ] Confirm notification delivery and officer alerts are timely.
- [ ] Confirm no member sees another member's data.

### First week and first renewal cycle

- [ ] Review application conversion, approval time, pending cash/transfers/cheques, delivery failure, payment review, and officer workload.
- [ ] Verify scheduled jobs and stale-claim recovery daily for the first week.
- [ ] Produce and reconcile the first bookkeeping report.
- [ ] Rehearse/report on 1 November renewal opening, 1 January charging/grace, and 1 March lapse before those dates occur in production.
- [ ] Obtain a one-week operational acceptance from the membership officer and treasurer.

## 15. Emergency drain and rollback

Switching back to MemberMojo stops new financial work while signed webhook reconciliation continues. It is one confirmation on Administrator > Membership system, takes effect at once, and can also stop the queued membership emails. Card renewals already set up in Stripe continue until they are cancelled there.

- [ ] Switch back to MemberMojo when duplicate charging, incorrect entitlement, portal data exposure, webhook corruption, or widespread delivery failure is suspected.
- [ ] Confirm MemberMojo mode blocks new public applications, Checkout creation, reminders, renewal charging commands, and lapse automation.
- [ ] Keep signed webhooks, existing payment reconciliation, officer queues, and recovery tooling available.
- [ ] Preserve all event, payment, audit, and command records; do not delete or edit financial history.
- [ ] Expire or disable unsafe open Checkout sessions through an audited recovery action.
- [ ] Notify affected members in provider-neutral language after the incident scope is known.
- [ ] Reconcile Stripe independently before restoring service.
- [ ] Prefer rolling back application code while leaving additive migrations in place.
- [ ] Repeat the affected journeys on a preview database, and obtain fresh approval before switching the production Membership system to the website again.
- [ ] Document the incident, root cause, affected records, financial reconciliation, member communications, and preventative action.

## Release evidence and sign-off

| Evidence | Reference/date | Verified by |
| --- | --- | --- |
| Release commit |  |  |
| Preview automated test run |  |  |
| Preview journey report |  |  |
| Security audit |  |  |
| Production migration review |  |  |
| Stripe live configuration review |  |  |
| Resend delivery review |  |  |
| MemberMojo import manifest/checksum |  |  |
| Membership reconciliation report |  |  |
| Financial reconciliation report |  |  |
| Shared-email/portal conflict report |  |  |
| Backup/recovery point |  |  |
| Drain/rollback rehearsal |  |  |

| Approval | Name | Date/time | Decision/notes |
| --- | --- | --- | --- |
| Release owner |  |  |  |
| Membership officer |  |  |  |
| Treasurer |  |  |  |
| Technical/security approver |  |  |  |

## Accepted exceptions

Record only non-critical exceptions. Financial correctness, entitlement integrity, identity/portal isolation, webhook authenticity, unresolved migration conflicts, high/critical security findings, and rollback capability may not be waived.

| Exception | Risk | Compensating control | Owner | Review/expiry date |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
