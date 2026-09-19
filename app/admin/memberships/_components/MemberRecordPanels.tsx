import {
  assignMemberPortalLogin,
  correctMemberEligibility,
  removeMemberPortalLogin,
  reportOfflineMembershipPaymentFailure,
  requestMemberContactChange,
} from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { money, paymentMethodName } from "@/lib/membership-admin/format";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

/** The side panels opened from a member's record: change contact details, correct the date of birth, website login and reporting a returned payment. */

const Actions = ({ children }: { children: React.ReactNode }) => <div className={styles.actionRow}><span/>{children}</div>;

export function MemberContactPanel({ memberId, name, email, role, closeHref }: {
  memberId: string; name: string; email: string | null; role: string | null; closeHref: string;
}) {
  return <SidePanel closeHref={closeHref} label={`Change correspondence details for ${name}`} eyebrow="Contact" eyebrowClassName={styles.pillMute} title="Change contact details">
    <p className={styles.panelNote}>A changed email address is used only after the mailbox confirms it. Shared addresses are allowed.</p>
    <form action={requestMemberContactChange} className="editor-form">
      <input type="hidden" name="member_id" value={memberId}/>
      <label>Email address <em>Leave empty to remove</em><input type="email" name="contact_email" defaultValue={email ?? ""}/></label>
      <label>Whose address is this?<select name="contact_role" defaultValue={role || "self"}>
        <option value="self">The member’s own</option>
        <option value="guardian">Guardian correspondence</option>
        <option value="shared_household">Shared household correspondence</option>
      </select></label>
      <label>Reason for the change<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
      <Actions><PendingSubmitButton pendingLabel="Saving…">Save changes</PendingSubmitButton></Actions>
    </form>
  </SidePanel>;
}

export function MemberBirthdatePanel({ memberId, name, dateOfBirth, today, closeHref }: {
  memberId: string; name: string; dateOfBirth: string | null; today: string; closeHref: string;
}) {
  return <SidePanel closeHref={closeHref} label={`Correct the date of birth for ${name}`} eyebrow="Personal details" eyebrowClassName={styles.pillMute} title="Correct the date of birth">
    <p className={styles.panelNote}>Use this only when the saved date is wrong. The reason is kept in the member’s history.</p>
    <form action={correctMemberEligibility} className="editor-form">
      <input type="hidden" name="member_id" value={memberId}/>
      <label>Date of birth<input type="date" name="date_of_birth" defaultValue={dateOfBirth ?? ""} max={today} required/></label>
      <label>Reason for the change<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
      <Actions><PendingSubmitButton pendingLabel="Saving…">Save corrected date</PendingSubmitButton></Actions>
    </form>
  </SidePanel>;
}

export function MemberLoginPanel({ memberId, name, hasLogin, closeHref }: {
  memberId: string; name: string; hasLogin: boolean; closeHref: string;
}) {
  return <SidePanel closeHref={closeHref} label={`Website login for ${name}`} eyebrow="Website login" eyebrowClassName={styles.pillMute} title={hasLogin ? "Remove website access" : "Assign a website login"}>
    <p className={styles.panelNote}>A shared contact address never gives one person access to another person’s membership. Each member with website access needs a unique login email.</p>
    {hasLogin
      ? <form action={removeMemberPortalLogin} className="stack-form">
        <input type="hidden" name="member_id" value={memberId}/>
        <label>Reason for removing access<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
        <Actions><PendingSubmitButton className="danger-button" pendingLabel="Removing…">Remove website access</PendingSubmitButton></Actions>
      </form>
      : <form action={assignMemberPortalLogin} className="stack-form">
        <input type="hidden" name="member_id" value={memberId}/>
        <label>Unique login email<input type="email" name="login_email" required/></label>
        <label>Reason for assigning this login<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
        <Actions><PendingSubmitButton pendingLabel="Assigning…">Assign or invite login</PendingSubmitButton></Actions>
      </form>}
  </SidePanel>;
}

export function PaymentProblemPanel({ paymentId, name, year, method, amountPence, reference, closeHref }: {
  paymentId: string; name: string; year: number; method: string; amountPence: number; reference: string | null; closeHref: string;
}) {
  return <SidePanel closeHref={closeHref} label={`Report a problem with a payment from ${name}`} eyebrow="Payment" eyebrowClassName={styles.pillPayment} title="Report a returned payment">
    <dl className={styles.facts}>
      <div><dt>Member</dt><dd>{name}</dd></div>
      <div><dt>Payment</dt><dd>{money(amountPence)} · {paymentMethodName(method)} · {year}</dd></div>
      {reference ? <div><dt>Reference</dt><dd>{reference}</dd></div> : null}
    </dl>
    <p className={styles.panelNote}>For a cheque that bounced, or a bank transfer that was reversed. The payment is sent for checking and the membership decision is made from the Inbox.</p>
    <form action={reportOfflineMembershipPaymentFailure} className="stack-form">
      <input type="hidden" name="payment_id" value={paymentId}/>
      <label>What happened?<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
      <Actions><PendingSubmitButton className="danger-button" pendingLabel="Saving…">Send payment for checking</PendingSubmitButton></Actions>
    </form>
  </SidePanel>;
}

