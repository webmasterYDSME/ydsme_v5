# Membership journey audit — 15 September 2026

## Result

The expanded local run passed **17 browser journeys**, **6 membership database suites**, and **90 unit/source-contract checks**. Production builds and lint passed. The Stripe test-mode journey passed checkout creation/expiry, activation, webhook replay, stale-event handling, and refund review.

All database writes used the Supabase stack at `http://127.0.0.1:55321`. Stripe used test credentials. No deployment was performed.

## Product issue found and fixed

**Membership officers could be blocked when signing in through the legacy `/settings?tab=membership` link.** The settings layout required the administrator role before the page could redirect to the membership workspace. The layout now requires an active signed-in user; the page retains its `settings.manage` check before loading general settings. The membership destination checks membership-management capability.

The browser suite now performs operational work with a committee account holding only `memberships.manage`. It verifies the legacy link, saving payment settings, denial of general settings, and loss of membership-management access after capability revocation.

## Coverage exercised

| Journey / edge case | Evidence |
| --- | --- |
| Member dashboard, library, minutes and Workbench | Browser |
| Adult/Student overlap, Junior guardian fields, underage rejection, staged form validation and Back navigation | Browser; rule tests |
| Repeat application resumes; separate people can share correspondence email | Browser |
| Junior and guardian verify separately | Browser |
| Guardian-led Junior uses one consent flow and receives no Junior login | Browser |
| Student and Concession verification, approval, offline payment and activation | Browser |
| Cheque receipt does not activate; clearance does | Browser; database |
| Officer creates paid cash and pending bank memberships; pending membership activates only after payment confirmation | Browser |
| Existing website account is linked only after officer confirmation | Browser; database |
| Paid member sees membership/payment history; already-paid term cannot be paid again through officer form | Browser |
| Correspondence changes remain pending until confirmation; superseded and reused links fail; login identity remains unchanged | **New browser coverage** |
| Reversed bank payment enters review; officer records a lapse decision | **New browser coverage** |
| Honorary membership creates no payment and produces a manual-contact task | Browser; database |
| Officer versions payment instructions; public bank option becomes available without exposing account number | Browser; database |
| Administrator grants officer capability; committee read-only access and revocation are respected | Browser; database |
| Officer workspace tabs, deep links, and desktop/tablet/phone layout | Browser |
| Duplicate member override, missing Student declaration, missing Junior consent, expired guardian consent, future receipt date | Database |
| Grace period, March lapse, honorary-to-paid transition, suspension/archival precedence, retention/legal hold | Database |
| Annual fee carry-forward, immutable year snapshots, public price-view permissions and notification ownership | Database |
| All four plans create subscription checkout with correct initial charge and annual line; expired checkout produces notification | Stripe test mode |
| Paid invoice activates member; replay creates no duplicate payment; stale subscription event does not overwrite current state; refund enters review | Stripe test mode |
| Invalid webhook signature rejected | Stripe test mode |

## Test reliability changes

- Added the previously omitted officer-workspace browser test and payment-settings permission database test to their runners.
- Removed stale August fee expectations and updated selectors to match current page structure and permissions.
- Added a separate least-privilege officer fixture; administrator access is reserved for granting capabilities.
- Restricted payment-settings cleanup to the test Treasurer record. Previously, setup failure before capturing the original settings could cause cleanup to delete existing local settings. This happened during the audit; the migration's local default settings were restored.
- Added correspondence-request cleanup and reset the local contact-change rate-limit scope for repeatable runs.
- Made the payment-settings permission test create its own actor inside its rolled-back transaction.
- Tightened membership database tests to require the exact mandated local endpoint instead of accepting any loopback port.
- Changed the Stripe runner to obtain Supabase credentials from local status and validate test-mode keys before building, replacing its hard-coded alternate workdir.

Final cleanup confirmed **zero journey membership records**, **zero journey login accounts**, and **one active payment-settings version**.

## Limits and remaining coverage gaps

These results cover the paths above, rather than every possible combination of membership state and concurrent action.

- Browser automation used Chromium. Firefox, Safari/WebKit and assistive-technology testing were not performed.
- Stripe checks used real test-mode checkout sessions and paid test invoices with locally signed webhook events. Completing hosted card entry, 3-D Secure challenges, card declines and automatic external webhook delivery were not exercised.
- Live email deliverability was not tested. The local journeys inspect notification records and local delivery state.
- Complete report ZIP generation/download, browser-based fee changes, Student renewal requests/reviews, honorary revocation UI, and all payment-review decisions still need dedicated browser coverage. Some underlying rules are covered by database/source tests.
- Simultaneous contact confirmations, simultaneous fee/settings edits, and simultaneous offline/online payment completion were not stress-tested in this run.

## Re-run

```sh
npm run test:unit
node --experimental-strip-types --test --test-concurrency=1 tests/membership-*.local.test.mjs
npm run test:membership-journeys
npm run test:stripe-membership
npm run lint
```

Run the two journey commands sequentially: both build into `.next` and use the same local database. The Stripe command requires test credentials in `.env.local`. On this machine, Git-dependent unit checks required `DEVELOPER_DIR=/Library/Developer/CommandLineTools` because the selected Xcode installation has an unaccepted licence.
