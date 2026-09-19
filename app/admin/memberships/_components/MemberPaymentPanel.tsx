import Link from "next/link";
import { CirclePoundSterling } from "lucide-react";
import { confirmExistingMemberOfflineRenewal } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { londonToday, money } from "@/lib/membership-admin/format";
import type { RenewalChoice } from "@/lib/membership-rules";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

/** Records a cash, bank-transfer or cheque renewal for the member whose page is open. */
export function MemberPaymentPanel({ memberId, name, planName, renewable, choices, currentYear, year, closeHref, yearHref, returnTo }: {
  memberId: string;
  name: string;
  planName: string | null;
  renewable: boolean;
  choices: RenewalChoice[];
  currentYear: number;
  year: number;
  closeHref: string;
  yearHref: (year: number) => string;
  /** Where the result should appear. Leave out to return to the member's own record. */
  returnTo?: "renewals";
}) {
  const today = londonToday();
  const choice = choices.find((item) => item.membership_year === year) ?? null;
  const canRecord = choice?.amount_pence !== null && choice?.amount_pence !== undefined;
  return <SidePanel closeHref={closeHref} label={`Record a payment for ${name}`} eyebrow="Payment" eyebrowClassName={styles.pillPayment} title="Record a payment">
    <dl className={styles.facts}><div><dt>Member</dt><dd>{name}</dd></div><div><dt>Membership</dt><dd>{planName || "Not set"}</dd></div></dl>
    {renewable ? <>
      <nav className={styles.chips} aria-label="Membership year">
        {[currentYear, currentYear + 1].map((option) => <Link key={option} className={`${styles.chip} ${option === year ? styles.chipOn : ""}`} href={yearHref(option)} prefetch={false} aria-current={option === year ? "true" : undefined}>{option}</Link>)}
      </nav>
      <form action={confirmExistingMemberOfflineRenewal} className="editor-form membership-cash-renewal-form">
        <input type="hidden" name="member_id" value={memberId}/>
        <input type="hidden" name="membership_year" value={year}/>
        {returnTo ? <input type="hidden" name="return_to" value={returnTo}/> : null}
        <div className={`membership-renewal-charge ${canRecord ? "" : "is-unavailable"}`} aria-live="polite">
          <CirclePoundSterling aria-hidden="true"/>
          <div><span>Amount to record</span><strong>{canRecord ? money(choice!.amount_pence!) : "No payment due"}</strong><small>{choice?.note ?? "Choose a membership year."}</small></div>
        </div>
        <label>Payment method<select name="payment_method"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label>
        <label>Receipt or payment reference<input name="payment_reference" minLength={2} maxLength={120} required/></label>
        <label>Date received<input type="date" name="received_on" max={today} defaultValue={today} required/></label>
        <label className="checkbox-row"><input type="checkbox" name="cleared"/>Cheque cleared <em>Cheque payments only</em></label>
        <div className={styles.actionRow}><span/><PendingSubmitButton disabled={!canRecord} pendingLabel="Saving payment…">Record payment</PendingSubmitButton></div>
      </form>
    </> : <p className={styles.panelNote}>Payments cannot be recorded for this membership. It may be suspended, honorary, or have no membership type set.</p>}
  </SidePanel>;
}
