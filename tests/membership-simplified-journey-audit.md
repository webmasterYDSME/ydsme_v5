# Simplified membership journeys — 17 September 2026

## Release boundary

MemberMojo remains the live membership system. These changes implement the new website feature; they do not import MemberMojo data, migrate live subscriptions, enable the feature or deploy it. Database writes and fixtures used only the isolated Supabase stack at `http://127.0.0.1:55321`; Stripe journeys used test credentials.

Apply `supabase/migrations/202609170001_membership_simplified_journeys.sql` through the normal release process before enabling the new flow. The existing MemberMojo, pilot, live and drain controls remain in force.

## Implemented journeys

| Journey | Behaviour |
| --- | --- |
| Adult signup | Enter eligibility and identity, request and verify a six-digit email code, choose payment, submit. Payment activates membership. |
| Junior signup | Guardian completes the Junior's name and DOB, supplies their own name and email, and gives explicit consent. Only the guardian mailbox is verified. No Junior portal is created on the guardian address. |
| Junior, Student and Concession payment | No officer decision is needed before payment. A paid membership is active while manual verification remains pending. |
| Officer verification | Confirm eligibility and Junior consent in the paid-membership queue. A denial suspends access, records the decision and creates a manual-refund follow-up. No refund is automatically issued. |
| Shared family email | Different names can have separate memberships at one address. Portal allocation is serialized for the first paid, eligible member. An existing login is not reassigned merely because its email matches. |
| Duplicate signup | Same normalized name and email are blocked from creating a second application, including concurrent submissions and a changed DOB. Ambiguous identities go to an officer. Verified applicants can resume an unpaid online application. |
| Abandoned signup | A verified draft is retained for 30 days and restored in the same browser. A fresh email verification can recover matching saved details or the existing payment link. Submitted, unpaid online applications get one reminder after 24 hours. Cash, cheque and bank-transfer applications get one reminder after seven days. Paying or application expiry cancels it. Financial records are retained for reconciliation. |
| Annual renewal | Officer checks fees and opens a year. Eligible unpaid members receive individual Society payment links; no login is required. Shared mailboxes receive separate invitations for each member. Members without email appear in manual-contact work. |
| Renewal retries | Invitation and notification are recorded in one transaction. Reopening a year resumes safely without duplicate invitations. A paid or partially paid term cannot start another checkout. |
| Age changes | Opening renewals prepares relevant age-based plan transitions immediately, including an early opening before November. |
| Payment | Joining and renewal use one-time Stripe Checkout. No Billing subscription is created. Verified webhooks remain the authority for activation. |
| Offline payment details | Bank transfer, cash and cheque confirmation pages and emails list the calculated amount and the relevant payment instructions. The applicant’s full name identifies the payment; no generated membership reference is required. |

Existing officer-created, offline-payment, honorary, portal-login and account-recovery workflows remain available. Existing membership-type change requests are separate from the new signup verification queue.

## Security and recovery

- Codes are cryptographically generated, stored as keyed hashes, expire after ten minutes, allow five attempts and are single-use.
- Sending has mailbox, IP and global limits plus a 60-second mailbox cooldown and the existing Turnstile check.
- The verified identity is bound to an HttpOnly, SameSite cookie and checked again on submission. Duplicate results are shown only after email verification.
- New session, renewal and portal-claim tables have RLS enabled and no anonymous/authenticated table access.
- Public renewal tokens are random, stored as hashes, expire, use no-referrer headers and authorize only the linked membership payment.
- Server-signed invitation metadata allows a webhook retry to recover its own partially completed portal invitation without linking arbitrary existing accounts by email.
- Officer mutations require the membership-management capability; database review functions check it again.
- Denial does not erase the original payment. Provider refunds continue to reconcile through signed webhooks.

## Validation

- Production builds, TypeScript and lint pass.
- The reusable local visual matrix passes all 17 requested application journeys: Adult online success/failure, cheque, cash and bank transfer; Student and Concession online, cheque, cash and bank transfer; and Junior online, cheque, cash and bank transfer. It uses real Stripe test Checkout for card outcomes, Mailpit for each code and payment email, and retained local records for duplicate testing. Desktop and fresh 390px mobile captures have no horizontal overflow.
- All 18 browser journeys pass (10 new-flow/workspace checks and 8 retained regressions). The new browser suite covers all four tiers, guardian-only verification, guessing limits, draft restoration, duplicates/shared mailboxes, paid Junior activation before review, officer confirmation, and idempotent renewal opening with a public payment link.
- Eight local database checks pass across seven membership suites. Local database coverage includes membership lifecycle, cash/offline evidence, access precedence, fee carry-forward, plan-view security and payment settings. New checks cover single-use/expired codes, review authorization, denial/refund follow-up, retention, simultaneous duplicate submissions, family sharing, renewal idempotency and early age transitions.
- Stripe test-mode coverage creates one-time Checkout for all four tiers, exercises expiry, activates from a signed event, replays events without duplicate payments, recovers an interrupted portal link, pays a renewal without login/subscription, blocks a second renewal, and reconciles a refund into payment review. Hosted Checkout sessions and test PaymentIntents are real test-mode objects; successful Checkout webhook payloads are signed test fixtures.
- Unit/source-contract suite: all 93 checks pass after updating the obsolete event-booking return-link and password-reset navigation assertions to match the current UI.

The earlier `membership-journey-audit.md` describes the superseded approval/subscription signup flow. The membership journey runner now uses the new signup suite and retains applicable member-access and officer regression journeys from the earlier suite.

## December cutoff follow-up

November joining checkouts now expire no later than midnight entering 1 December, UK time. Stripe requires a minimum 30-minute session lifetime, so creation of new November checkouts pauses at 23:29 on 30 November (including a one-minute API-request margin). Applications and email verification remain saved. December reopens with the following year's full fee and the remaining December days included free.

A review page left open across the cutoff must refresh its price and coverage before it can create a payment session. Existing attempts are checked across membership years: a completed payment awaiting its webhook blocks another checkout. Activation uses the immutable server-side quote and signed event time, rather than recalculating the fee on delivery day. An extremely late webhook does not extend expired coverage. Cash/offline activation is unchanged.

Apply `202609170002_membership_december_checkout_cutoff.sql` after the first simplified-membership migration. It adds a service-only Checkout activation function; this migration was applied only to the local stack.

Validation: three boundary-rule tests; local delayed-event, quote-mismatch, replay and expired-coverage checks; existing offline/lifecycle database regressions; and the Stripe test-mode journey, including browser rejection of stale quotes for all four plans before creating any payment attempt. Production build, TypeScript and lint pass. Unit suite now has 93 passing checks and no failures.

### Persistent local Stripe setup

All four active local plans now have reusable test-mode Product mappings. The setup script creates no recurring prices; a second run reused all four products. Created and expired one-time test Checkout sessions for all four plans using those mappings; Stripe CLI forwarded each real expiry event to the running dev server with HTTP 200. The local listener saves its membership signing secret into ignored `.env.local`. All 93 unit checks and full lint pass. These setup smoke checks do not represent a completed browser card-payment journey.

## Manual edge reconciliation

The reusable `npm run test:membership-edges` browser journey was run against the local site and local Supabase stack. It verified:

- an incorrect or expired six-digit code stays on the form and shows a stable red error;
- the correct code still works after an incorrect attempt;
- an abandoned verified draft restores after reload and submits only one application;
- an exact name-and-email duplicate returns the existing application instead of creating another;
- a different family member can use the same correspondence email and reach Review;
- the 13/14, 17/18, 24/25 and 79/80 age boundaries select or reject the expected membership;
- Junior applications cannot continue without guardian consent, then continue when consent is recorded;
- the officer can confirm a paid membership, or deny one and receive a visible manual-refund follow-up.

Local test accounts and applications were deliberately retained for later duplicate and officer-workspace testing. No remote Supabase data was accessed or changed.
