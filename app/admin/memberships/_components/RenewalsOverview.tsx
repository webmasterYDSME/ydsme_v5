import Link from "next/link";
import { openRenewalCampaign, sendRenewalInvitations, sendRenewalReminders, sendRenewalTestEmail } from "@/lib/actions/membership-renewals";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { timestampDateLabel } from "@/lib/membership-admin/format";
import type { RenewalSummary } from "@/lib/membership-admin/renewals";
import { clearEstimateLabel } from "@/lib/email-queue-format";
import styles from "../memberships.module.css";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How the chosen year's renewals are going, and the two things an officer does about it: open them, and remind people. */
export function RenewalsOverview({ year, years, yearHref, open, summary, lastReminderAt, missingFees, billingOn, queue, queueHref }: {
  year: number;
  years: number[];
  yearHref: (year: number) => string;
  open: boolean;
  summary: RenewalSummary;
  lastReminderAt: string | null;
  /** Names of active membership types with no fee for this year. Opening is blocked until they have one. */
  missingFees: string[];
  billingOn: boolean;
  /** Renewal emails still waiting to go out, and how many queued emails can go each day. Null if the queue cannot be read. */
  queue: { waiting: number; perDay: number } | null;
  /** The email queue page, for administrators only. */
  queueHref: string | null;
}) {
  const blocked = missingFees.length > 0;
  return <section className={styles.card}>
    <nav className={styles.chips} aria-label="Membership year">
      {years.map((option) => <Link key={option} className={`${styles.chip} ${option === year ? styles.chipOn : ""}`} href={yearHref(option)} prefetch={false} aria-current={option === year ? "true" : undefined}>{option}</Link>)}
    </nav>
    <div className={`${styles.cardHead} ${styles.cardGap}`}>
      <h2>{year} renewals</h2>
      <span className={`${styles.pill} ${open ? styles.pillOk : styles.pillMute}`}>{open ? "Open" : "Not opened yet"}</span>
    </div>
    {open
      ? <dl className={`${styles.stats} ${styles.cardGap}`}>
        <div><dt>Invited</dt><dd>{summary.invited}</dd></div>
        <div><dt>Renewed</dt><dd>{summary.renewed}</dd></div>
        <div><dt>Waiting</dt><dd>{summary.waiting}</dd></div>
      </dl>
      : <p className={`${styles.panelNote} ${styles.cardGap}`}>Opening lets members renew from their account. It does not email anyone. Once it is open you can send yourself a test, then send each member who has not paid an email with their own renewal link{summary.toInvite ? ` (about ${plural(summary.toInvite, "member")})` : ""}. Members without an email address get a task in the Inbox instead.</p>}
    {open && queue && queue.waiting > 0
      ? <p className={`${styles.panelNote} ${styles.cardGap}`} role="status">{plural(queue.waiting, "email")} {queue.waiting === 1 ? "is" : "are"} waiting in the email queue. They go out a few at a time, within the daily limit. {clearEstimateLabel(queue.waiting, queue.perDay)}{queueHref ? <> <Link href={queueHref} prefetch={false}>Open the email queue</Link></> : null}</p> : null}
    {blocked ? <p className={`form-message error ${styles.cardGap}`} role="alert">Set a {year} fee for {missingFees.join(", ")} first (see Membership types and fees below).</p> : null}
    {!billingOn ? <p className={`${styles.panelNote} ${styles.cardGap}`}>Online renewals are switched off, so renewals cannot be opened.</p> : null}
    {open && summary.waitingWithoutEmail ? <p className={`${styles.panelNote} ${styles.cardGap}`}>{plural(summary.waitingWithoutEmail, "waiting member")} {summary.waitingWithoutEmail === 1 ? "has" : "have"} no email address, so {summary.waitingWithoutEmail === 1 ? "needs" : "need"} contacting another way.</p> : null}
    <div className={`${styles.actionRow} ${styles.cardGap}`}>
      <p className={styles.panelNote}>{open ? `${lastReminderAt ? `Last reminder sent ${timestampDateLabel(lastReminderAt)}.` : "No reminder sent yet."} Reminders also go out by themselves on 1 December, 1 January, 1 February and 22 February, to invited members who are still active or in their grace period and have not paid.` : ""}</p>
      <div className={styles.buttonPair}>
        {open
          ? <>
            <form action={sendRenewalTestEmail}>
              <input type="hidden" name="membership_year" value={year}/>
              <PendingSubmitButton className="button outline" pendingLabel="Sending…" disabled={!billingOn}
                confirmMessage="Send yourself a test renewal email? It goes only to your own address.">Send me a test</PendingSubmitButton>
            </form>
            {summary.toInvite > 0
              ? <form action={sendRenewalInvitations}>
                <input type="hidden" name="membership_year" value={year}/>
                <PendingSubmitButton className="button outline" pendingLabel="Queuing…" disabled={!billingOn || blocked}
                  confirmMessage={`Queue the renewal invitation for ${plural(summary.toInvite, "member")} who ${summary.toInvite === 1 ? "has" : "have"} not been invited yet? The emails are not sent all at once: they go out a few at a time within the daily email limit.`}>Send invitations</PendingSubmitButton>
              </form> : null}
            <form action={sendRenewalReminders}>
              <input type="hidden" name="membership_year" value={year}/>
              <PendingSubmitButton disabled={!billingOn || summary.remindable === 0} pendingLabel="Queuing…"
                confirmMessage={`Queue a reminder for up to ${plural(summary.remindable, "member")} who ${summary.remindable === 1 ? "has" : "have"} not renewed? Anyone reminded in the last 7 days is skipped. The emails go out a few at a time within the daily email limit.`}>Send reminder</PendingSubmitButton>
            </form>
          </>
          : <form action={openRenewalCampaign}>
            <input type="hidden" name="membership_year" value={year}/>
            <PendingSubmitButton disabled={!billingOn || blocked} pendingLabel="Opening…"
              confirmMessage={`Open ${year} renewals? Nobody is emailed until you choose Send invitations.`}>Open renewals</PendingSubmitButton>
          </form>}
      </div>
    </div>
  </section>;
}
