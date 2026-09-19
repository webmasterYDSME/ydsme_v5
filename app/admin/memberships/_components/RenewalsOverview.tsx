import Link from "next/link";
import { openRenewalCampaign, sendRenewalReminders } from "@/lib/actions/membership-renewals";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { timestampDateLabel } from "@/lib/membership-admin/format";
import type { RenewalSummary } from "@/lib/membership-admin/renewals";
import styles from "../memberships.module.css";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How the chosen year's renewals are going, and the two things an officer does about it: open them, and remind people. */
export function RenewalsOverview({ year, years, yearHref, open, summary, lastReminderAt, missingFees, billingOn }: {
  year: number;
  years: number[];
  yearHref: (year: number) => string;
  open: boolean;
  summary: RenewalSummary;
  lastReminderAt: string | null;
  /** Names of active membership types with no fee for this year. Opening is blocked until they have one. */
  missingFees: string[];
  billingOn: boolean;
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
      : <p className={`${styles.panelNote} ${styles.cardGap}`}>Opening sends each member who has not paid an email with their own renewal link{summary.toInvite ? ` — about ${plural(summary.toInvite, "member")}` : ""}. Members without an email address get a task in the Inbox instead.</p>}
    {blocked ? <p className={`form-message error ${styles.cardGap}`} role="alert">Set a {year} fee for {missingFees.join(", ")} first (see Membership types and fees below).</p> : null}
    {!billingOn ? <p className={`${styles.panelNote} ${styles.cardGap}`}>Online renewals are switched off, so renewals cannot be opened.</p> : null}
    {open && summary.waitingWithoutEmail ? <p className={`${styles.panelNote} ${styles.cardGap}`}>{plural(summary.waitingWithoutEmail, "waiting member")} {summary.waitingWithoutEmail === 1 ? "has" : "have"} no email address, so {summary.waitingWithoutEmail === 1 ? "needs" : "need"} contacting another way.</p> : null}
    <div className={`${styles.actionRow} ${styles.cardGap}`}>
      <p className={styles.panelNote}>{open ? (lastReminderAt ? `Last reminder sent ${timestampDateLabel(lastReminderAt)}.` : "No reminder sent yet.") : ""}</p>
      <div className={styles.buttonPair}>
        {open && summary.toInvite > 0
          ? <form action={openRenewalCampaign}>
            <input type="hidden" name="membership_year" value={year}/>
            <PendingSubmitButton className="button outline" pendingLabel="Sending…" disabled={!billingOn || blocked}
              confirmMessage={`Send the renewal invitation to ${plural(summary.toInvite, "member")} who ${summary.toInvite === 1 ? "has" : "have"} not been invited yet?`}>Send missed invitations</PendingSubmitButton>
          </form> : null}
        {open
          ? <form action={sendRenewalReminders}>
            <input type="hidden" name="membership_year" value={year}/>
            <PendingSubmitButton disabled={!billingOn || summary.remindable === 0} pendingLabel="Sending…"
              confirmMessage={`Email a reminder to up to ${plural(summary.remindable, "member")} who ${summary.remindable === 1 ? "has" : "have"} not renewed? Anyone reminded in the last 7 days is skipped.`}>Send reminder</PendingSubmitButton>
          </form>
          : <form action={openRenewalCampaign}>
            <input type="hidden" name="membership_year" value={year}/>
            <PendingSubmitButton disabled={!billingOn || blocked} pendingLabel="Opening…"
              confirmMessage={`Open ${year} renewals and email a renewal link to ${summary.toInvite ? `about ${plural(summary.toInvite, "member")}` : "every member who has not paid"}?`}>Open renewals and send invitations</PendingSubmitButton>
          </form>}
      </div>
    </div>
  </section>;
}
