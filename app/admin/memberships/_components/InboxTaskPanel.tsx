import Link from "next/link";
import { Banknote } from "lucide-react";
import {
  completeManualMembershipContact,
  confirmExistingMemberOfflineRenewal,
  confirmOfflineMembership,
  recordOfflineApplicationPayment,
  resolveHonoraryPaymentConflict,
  resolveMembershipPaymentReview,
  retryMembershipNotification,
  reviewMembershipApplication,
  reviewStudentMembershipRequest,
} from "@/lib/actions/membership";
import { reviewPaidMembership } from "@/lib/actions/membership-renewals";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { dateLabel, londonToday, money, paymentMethodName } from "@/lib/membership-admin/format";
import { kindPillLabel, type InboxTask } from "@/lib/membership-admin/inbox";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

const pillClass: Record<InboxTask["kind"], string> = {
  payment: styles.pillPayment, verify: styles.pillVerify, request: styles.pillRequest, contact: styles.pillContact, problem: styles.pillProblem,
};

function facts(task: InboxTask): [string, string][] {
  switch (task.type) {
    case "application-payment": return [
      ["Membership", task.planName], ["Payment method", paymentMethodName(task.application.payment_method)],
      ["Email", task.application.contact_email || "None given"], ["Date of birth", dateLabel(task.application.date_of_birth)],
      ...(task.application.guardian_name ? [["Guardian", `${task.application.guardian_name} · consent is checked after payment`] as [string, string]] : []),
      ...(task.received?.received_on ? [["Cheque received", dateLabel(task.received.received_on)] as [string, string]] : []),
    ];
    case "renewal-payment": return [["Membership year", String(task.year)], ["Payment method", paymentMethodName(task.method)], ["Amount due", money(task.amountDuePence)]];
    case "verification": return [
      ["Date of birth", dateLabel(task.application.date_of_birth)],
      ...(task.application.guardian_name ? [["Guardian", task.application.guardian_name] as [string, string]] : []),
      ...(task.application.guardian_email || task.application.guardian_contact_number ? [["Guardian contact", [task.application.guardian_email, task.application.guardian_contact_number].filter(Boolean).join(" · ")] as [string, string]] : []),
      ...(task.application.guardian_consent_version ? [["Guardian consent", `Declaration ${task.application.guardian_consent_version} · ${task.application.guardian_verified_at ? `email verified ${new Date(task.application.guardian_verified_at).toLocaleDateString("en-GB")}` : "email verification pending"}`] as [string, string]] : []),
    ];
    case "student-request": return [["Requested for", String(task.year)], ["Membership until decided", "Adult"]];
    case "payment-review": return [["Membership year", String(task.year)], ["Paid", `${money(task.paidPence)} of ${money(task.duePence)}`]];
    case "refund": return [["To refund", money(task.outstandingPence)]];
    case "email-retry": return [["Sent to", task.recipient], ["Attempts", String(task.attempts)]];
    case "notice": return [["Area", task.area]];
    default: return [];
  }
}

const memberLink = (id: string, label: string) => <Link className={styles.linkButton} href={`/admin/memberships/members/${id}`}>{label}</Link>;

function Form({ task }: { task: InboxTask }) {
  const today = londonToday();
  switch (task.type) {
    case "application-payment": {
      const { application, received } = task;
      if (application.status === "awaiting_approval") return <div className={styles.panelForms}>
        <form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" required minLength={5} defaultValue="Membership details checked by an officer."/></label><PendingSubmitButton pendingLabel="Approving…">Approve application</PendingSubmitButton></form>
        <form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" required minLength={5}/></label><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Decline application</PendingSubmitButton></form>
      </div>;
      return <div className={styles.panelForms}>
        {application.payment_method === "cheque" && !received ? <form action={recordOfflineApplicationPayment} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="event" value="received"/><label>Cheque reference<input name="payment_reference" required/></label><label>Date received<input type="date" name="received_on" defaultValue={today} max={today} required/></label><PendingSubmitButton pendingLabel="Saving…">Mark cheque as received</PendingSubmitButton></form> : null}
        <form action={confirmOfflineMembership} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="payment_method" value={application.payment_method ?? ""}/><label>Receipt or payment reference<input name="payment_reference" defaultValue={received?.payment_reference || ""} required/></label><label>Date received<input type="date" name="received_on" defaultValue={received?.received_on || today} max={today} required/></label>{application.payment_method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<PendingSubmitButton pendingLabel="Confirming…"><Banknote/>Mark paid and activate</PendingSubmitButton></form>
      </div>;
    }
    case "renewal-payment": return <form action={confirmExistingMemberOfflineRenewal} className="stack-form"><input type="hidden" name="member_id" value={task.memberId ?? ""}/><input type="hidden" name="membership_year" value={task.year}/><input type="hidden" name="payment_method" value={task.method || "cash"}/><label>Receipt or payment reference<input name="payment_reference" required minLength={2} maxLength={120}/></label><label>Date received<input type="date" name="received_on" defaultValue={today} max={today} required/></label>{task.method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<PendingSubmitButton pendingLabel="Activating…">Mark paid and activate</PendingSubmitButton></form>;
    case "verification": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.application.guardian_name ? "Payment is received and the membership is already active. Check the details and guardian consent above, then record the outcome." : "Payment is received and the membership is already active. Record that the routine eligibility check is done, or, rarely, deny the membership."}</p>
      <form action={reviewPaidMembership} className="stack-form"><input type="hidden" name="application_id" value={task.application.id}/><label>Decision<select name="decision"><option value="approved">Confirm membership</option><option value="denied">Deny membership — arrange refund manually</option></select></label><label>Reason<textarea name="reason" rows={4} minLength={5} maxLength={500} placeholder="Record what was checked and any supporting details." required/></label><PendingSubmitButton pendingLabel="Saving…">Record verification</PendingSubmitButton></form>
    </div>;
    case "student-request": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>Adult membership stays selected until this request is approved. The member cannot pay the renewal fee until it is decided.</p>
      <form action={reviewStudentMembershipRequest} className="stack-form"><input type="hidden" name="transition_id" value={task.transitionId}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" minLength={5} maxLength={500} defaultValue="Student declaration reviewed by a membership officer." required/></label><PendingSubmitButton pendingLabel="Approving…">Approve Student membership</PendingSubmitButton></form>
      <form action={reviewStudentMembershipRequest} className="stack-form"><input type="hidden" name="transition_id" value={task.transitionId}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Keep Adult membership</PendingSubmitButton></form>
    </div>;
    case "manual-contact": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.body}</p>
      <p className={styles.panelNote}>Each person appears once, even when several updates need to be shared with them.</p>
      <form action={completeManualMembershipContact} className="stack-form"><input type="hidden" name="notification_id" value={task.notificationId}/><label>Contact note<textarea name="reason" minLength={5} maxLength={500} placeholder="For example: phoned on 20 August and spoke to the member." required/></label><PendingSubmitButton pendingLabel="Saving…">Mark all updates as contacted</PendingSubmitButton></form>
    </div>;
    case "payment-review": return <form action={resolveMembershipPaymentReview} className="stack-form"><p className={styles.panelNote}>A full refund or disputed payment was reported. Access stays available until a decision is recorded. Any refund must be issued through the online payment service.</p><input type="hidden" name="term_id" value={task.termId}/><label>Decision<select name="resolution"><option value="retain">Keep the membership active</option><option value="replace">Ask for another payment</option><option value="lapse">End the membership</option></select></label><label>Reason for the decision<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></form>;
    case "honorary-conflict": return task.memberId
      ? <form action={resolveHonoraryPaymentConflict} className="stack-form"><p className={styles.panelNote}>{task.body} Refunds are never issued automatically.</p><input type="hidden" name="member_id" value={task.memberId}/><label>Decision<select name="decision"><option value="retain">Keep the payment on record; no refund</option><option value="handled-in-stripe">Payment handled through the online payment service</option></select></label><label>Reason for the decision<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></form>
      : <p className={styles.panelNote}>{task.body}</p>;
    case "refund": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.reason || "Membership was denied after payment."} Arrange the refund through the payment service, then it drops out of this list once nothing is left to refund.</p>
      {task.memberId ? memberLink(task.memberId, "View payment") : null}
    </div>;
    case "email-retry": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>The email could not be delivered. Correct the address, retry delivery, or contact the member another way.</p>
      {task.error ? <details className={styles.technical}><summary>Technical details</summary><small>{task.error}</small></details> : null}
      <form action={retryMembershipNotification}><input type="hidden" name="notification_id" value={task.notificationId}/><PendingSubmitButton pendingLabel="Requesting retry…">Retry email</PendingSubmitButton></form>
      {task.memberId ? memberLink(task.memberId, "Correct this member’s contact details") : null}
    </div>;
    case "notice": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.body}</p>
      {task.technical ? <details className={styles.technical}><summary>Technical details</summary><small>{task.technical}</small></details> : null}
      {task.href ? <Link className="button outline" href={task.href}>{task.hrefLabel}</Link> : null}
      <p className={styles.panelNote}>This clears by itself once the underlying problem is fixed.</p>
    </div>;
  }
}

export function InboxTaskPanel({ task, closeHref }: { task: InboxTask; closeHref: string }) {
  const rows = facts(task);
  return <SidePanel closeHref={closeHref} label={`${kindPillLabel[task.kind]}: ${task.name}`} eyebrow={kindPillLabel[task.kind]} eyebrowClassName={pillClass[task.kind]} title={task.name}>
    {rows.length ? <dl className={styles.facts}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    <Form task={task}/>
    {task.memberId && task.type !== "refund" && task.type !== "email-retry" ? memberLink(task.memberId, "Open full membership record") : null}
  </SidePanel>;
}

