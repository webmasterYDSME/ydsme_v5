import type { ReactNode } from "react";
import Link from "next/link";
import { Banknote } from "lucide-react";
import {
  closeOfflineMembershipApplication,
  completeManualMembershipContact,
  recordDeniedMembershipRefund,
  resolveMembershipDeliveryProblem,
  resolveUnappliedMembershipPayment,
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
import { ageOn, dateLabel, londonToday, timestampDateLabel, money, paymentMethodName } from "@/lib/membership-admin/format";
import { kindPillLabel, type InboxTask, type VerificationPayment } from "@/lib/membership-admin/inbox";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

const pillClass: Record<InboxTask["kind"], string> = {
  payment: styles.pillPayment, verify: styles.pillVerify, request: styles.pillRequest, contact: styles.pillContact, problem: styles.pillProblem,
};

function facts(task: InboxTask): [string, string][] {
  switch (task.type) {
    case "application-payment": {
      const { application, received, amountDuePence, planName } = task;
      const age = ageOn(application.date_of_birth, londonToday());
      return [
        ["Membership type", planName],
        ...(amountDuePence != null ? [["Amount due", money(amountDuePence)] as [string, string]] : []),
        ["Payment method", paymentMethodName(application.payment_method).replace(/^./, (c) => c.toUpperCase())],
        ["Date of birth", application.date_of_birth ? `${dateLabel(application.date_of_birth)}${age !== null ? ` · ${age}yo` : ""}` : "Not recorded"],
        // On a guardian-led application the address on file is the guardian's.
        ...(application.guardian_led ? [] : [[application.guardian_name ? "Member’s email" : "Email", application.contact_email || "None given"] as [string, string]]),
        ...(application.guardian_name ? [["Guardian", application.guardian_name] as [string, string]] : []),
        ...(received?.received_on ? [["Cheque received", dateLabel(received.received_on)] as [string, string]] : []),
      ];
    }
    case "renewal-payment": return [["Membership year", String(task.year)], ["Payment method", paymentMethodName(task.method)], ["Amount due", money(task.amountDuePence)]];
    case "student-request": return [["Requested for", String(task.year)], ["Membership until decided", "Adult"]];
    case "payment-review": return [["Membership year", String(task.year)], ["Paid", `${money(task.paidPence)} of ${money(task.duePence)}`]];
    case "refund": return [["To refund", money(task.outstandingPence)], ...(task.reason ? [["Reason for denial", task.reason] as [string, string]] : [])];
    case "unapplied-payment": return [["Paid by card", task.amountPence != null ? money(task.amountPence) : "Amount not recorded"], ...(task.year ? [["Membership year", String(task.year)] as [string, string]] : [])];
    case "email-delivery": return [["Email", task.subject ?? "A membership email"], ["Sent to", task.recipient ?? "Not recorded"]];
    case "email-retry": return [["Sent to", task.recipient], ["Attempts", String(task.attempts)]];
    case "notice": return [["Area", task.area]];
    default: return [];
  }
}

type Section = { title: string; rows: [string, ReactNode][] };

const paymentStatusLabel: Record<string, string> = {
  paid: "Paid", pending: "Not paid yet", refunded: "Refunded", partially_refunded: "Partly refunded", disputed: "Disputed",
  failed: "Failed", void: "Cancelled", unknown: "Not confirmed. Check the payment record",
};

function paymentRows(payment: VerificationPayment | null): [string, ReactNode][] {
  if (!payment) return [["Payment", "No payment details found"]];
  const rows: [string, ReactNode][] = [];
  const amount = payment.amountPence != null ? ` · ${money(payment.amountPence)}` : "";
  rows.push(["Payment", `${paymentStatusLabel[payment.status] ?? payment.status.replaceAll("_", " ")}${amount}`]);
  rows.push(["Method", payment.method ? paymentMethodName(payment.method).replace(/^./, (c) => c.toUpperCase()) : "Not recorded"]);
  if (payment.refundedPence > 0) rows.push(["Refunded", money(payment.refundedPence)]);
  if (payment.reference) rows.push(["Reference", <span key="ref" className={styles.mono}>{payment.reference}</span>]);
  if (payment.receivedOn) rows.push([payment.method === "stripe" ? "Paid on" : "Received", dateLabel(payment.receivedOn)]);
  const stripe = payment.stripe;
  if (stripe?.paymentIntent) rows.push(["Stripe payment", <span key="pi"><span className={styles.mono}>{stripe.paymentIntent}</span>{stripe.dashboardUrl ? <> · <a className={styles.inlineLink} href={stripe.dashboardUrl} target="_blank" rel="noreferrer">Open in Stripe<span className="sr-only"> (opens in a new tab)</span></a></> : null}</span>]);
  return rows;
}

function verificationSections(task: Extract<InboxTask, { type: "verification" }>): { sections: Section[]; warning: string | null } {
  const { application, planName, payment } = task;
  const today = londonToday();
  const age = ageOn(application.date_of_birth, today);
  const junior = Boolean(application.guardian_name);
  const person: [string, ReactNode][] = [
    ["Membership type", application.student_declaration ? `${planName} · student declaration made` : planName],
    ["Date of birth", application.date_of_birth ? `${dateLabel(application.date_of_birth)}${age !== null ? ` · ${age}yo` : ""}` : "Not recorded"],
    // On a guardian-led application the address on file is the guardian's, which is shown under Guardian.
    ...(application.guardian_led ? [] : [[junior ? "Member’s email" : "Email", application.contact_email || "None given"] as [string, ReactNode]]),
  ];
  const guardian: [string, ReactNode][] = application.guardian_name ? [
    ["Guardian", application.guardian_name],
    ...(application.guardian_email || application.guardian_contact_number ? [["Contact", [application.guardian_email, application.guardian_contact_number].filter(Boolean).join(" · ")] as [string, ReactNode]] : []),
    ...(application.guardian_consent_version ? [["Consent", <span key="consent" className={styles.lines}><span>Declaration {/^\d{4}-\d{2}-\d{2}$/.test(application.guardian_consent_version) ? dateLabel(application.guardian_consent_version) : application.guardian_consent_version}</span><span>{application.guardian_verified_at ? `Email verified ${timestampDateLabel(application.guardian_verified_at)}` : "Email verification pending"}</span></span>] as [string, ReactNode]] : []),
  ] : [];
  const sections: Section[] = [{ title: "Applicant", rows: person }];
  if (guardian.length) sections.push({ title: "Guardian", rows: guardian });
  sections.push({ title: "Payment", rows: paymentRows(payment) });
  const warning = age !== null && age < 18 && !application.guardian_name ? "Under 18, but no guardian details are on file." : null;
  return { sections, warning };
}

const memberLink = (id: string, label: string) => <Link className={styles.linkButton} href={`/admin/memberships/members/${id}`}>{label}</Link>;

/** The link to the full record on the left and the main button on the right, on one row. */
function Actions({ task, link = true, children }: { task: InboxTask; link?: boolean; children: ReactNode }) {
  return <div className={styles.actionRow}>{link && task.memberId ? memberLink(task.memberId, "Open full membership record") : <span/>}{children}</div>;
}

/** Drawers whose form already carries the record link, so it is not repeated below. */
const recordLinkInForm = new Set<InboxTask["type"]>(["verification", "renewal-payment", "payment-review", "honorary-conflict", "manual-contact", "refund", "email-delivery", "unapplied-payment"]);

function Form({ task }: { task: InboxTask }) {
  const today = londonToday();
  switch (task.type) {
    case "application-payment": {
      const { application, received } = task;
      if (application.status === "awaiting_approval") return <div className={styles.panelForms}>
        <p className={styles.panelNote}>This is an older application that still needs a decision before payment.</p>
        <form action={reviewMembershipApplication} className="stack-form"><h3 className={styles.formTitle}>Approve</h3><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" required minLength={5} defaultValue="Membership details checked by an officer."/></label><Actions task={task} link={false}><PendingSubmitButton pendingLabel="Approving…">Approve application</PendingSubmitButton></Actions></form>
        <form action={reviewMembershipApplication} className="stack-form"><h3 className={styles.formTitle}>Decline</h3><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" required minLength={5}/></label><Actions task={task} link={false}><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Decline application</PendingSubmitButton></Actions></form>
      </div>;
      const cheque = application.payment_method === "cheque";
      return <div className={styles.panelForms}>
        {cheque && !received ? <form action={recordOfflineApplicationPayment} className="stack-form"><h3 className={styles.formTitle}>Cheque received</h3><p className={styles.panelNote}>Use this when the cheque arrives but has not cleared yet.</p><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="event" value="received"/><label>Cheque reference<input name="payment_reference" required/></label><label>Date received<input type="date" name="received_on" defaultValue={today} max={today} required/></label><Actions task={task} link={false}><PendingSubmitButton pendingLabel="Saving…">Mark cheque as received</PendingSubmitButton></Actions></form> : null}
        <form action={confirmOfflineMembership} className="stack-form">{cheque && !received ? <><h3 className={styles.formTitle}>Payment complete</h3><p className={styles.panelNote}>Use this once the payment has cleared.</p></> : null}<input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="payment_method" value={application.payment_method ?? ""}/><label>Receipt or payment reference<input name="payment_reference" defaultValue={received?.payment_reference || ""} required/></label><label>Date received<input type="date" name="received_on" defaultValue={received?.received_on || today} max={today} required/></label>{cheque ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<Actions task={task}><PendingSubmitButton pendingLabel="Confirming…"><Banknote/>Mark paid and activate</PendingSubmitButton></Actions></form>
        <details className={styles.technical}><summary>Not going ahead? Close this application</summary>
          <form action={closeOfflineMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><p className={styles.panelNote}>Use this for a repeat application or one that will not be paid. The applicant is not emailed.</p><label>Reason<input name="reason" minLength={5} maxLength={500} placeholder="For example: repeat application, already a member." required/></label><PendingSubmitButton className="danger-button" pendingLabel="Closing…">Close application</PendingSubmitButton></form>
        </details>
      </div>;
    }
    case "renewal-payment": return <form action={confirmExistingMemberOfflineRenewal} className="stack-form"><input type="hidden" name="member_id" value={task.memberId ?? ""}/><input type="hidden" name="membership_year" value={task.year}/><input type="hidden" name="payment_method" value={task.method || "cash"}/><label>Receipt or payment reference<input name="payment_reference" required minLength={2} maxLength={120}/></label><label>Date received<input type="date" name="received_on" defaultValue={today} max={today} required/></label>{task.method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<Actions task={task}><PendingSubmitButton pendingLabel="Activating…">Mark paid and activate</PendingSubmitButton></Actions></form>;
    case "verification": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.application.guardian_name ? "This member has paid and is already active. Check their age, guardian details and consent above, then confirm the membership or deny it." : "This member has paid and is already active. Check the details above match the membership type, then confirm the membership or deny it."}</p>
      <form action={reviewPaidMembership} className="stack-form"><input type="hidden" name="application_id" value={task.application.id}/><label>Decision<select name="decision"><option value="approved">Confirm membership</option><option value="denied">Deny membership — arrange refund manually</option></select></label><label>Reason<textarea name="reason" rows={4} minLength={5} maxLength={500} placeholder="Record what was checked and any supporting details." required/></label><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Record verification</PendingSubmitButton></Actions></form>
    </div>;
    case "student-request": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>Adult membership stays selected until this request is approved. The member cannot pay the renewal fee until it is decided.</p>
      <form action={reviewStudentMembershipRequest} className="stack-form"><h3 className={styles.formTitle}>Approve</h3><input type="hidden" name="transition_id" value={task.transitionId}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" minLength={5} maxLength={500} defaultValue="Student declaration reviewed by a membership officer." required/></label><Actions task={task} link={false}><PendingSubmitButton pendingLabel="Approving…">Approve Student membership</PendingSubmitButton></Actions></form>
      <form action={reviewStudentMembershipRequest} className="stack-form"><h3 className={styles.formTitle}>Decline</h3><input type="hidden" name="transition_id" value={task.transitionId}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" minLength={5} maxLength={500} required/></label><Actions task={task} link={false}><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Keep Adult membership</PendingSubmitButton></Actions></form>
    </div>;
    case "manual-contact": return <div className={styles.panelForms}>
      {task.items.map((text, index) => <p key={index} className={styles.callout} style={{ whiteSpace: "pre-line" }}>{text}</p>)}
      <p className={styles.panelNote}>Each person appears once, even when several updates need to be shared with them.</p>
      <form action={completeManualMembershipContact} className="stack-form"><input type="hidden" name="notification_id" value={task.notificationId}/><label>Contact note<textarea name="reason" rows={3} minLength={5} maxLength={500} placeholder="For example: phoned on 20 August and spoke to the member." required/></label><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Mark as contacted</PendingSubmitButton></Actions></form>
    </div>;
    case "payment-review": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>A full refund or disputed payment was reported. Access stays available until a decision is recorded. Any refund must be issued through the online payment service.</p>
      <form action={resolveMembershipPaymentReview} className="stack-form"><input type="hidden" name="term_id" value={task.termId}/><label>Decision<select name="resolution"><option value="retain">Keep the membership active</option><option value="replace">Ask for another payment</option><option value="lapse">End the membership</option></select></label><label>Reason for the decision<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></Actions></form>
    </div>;
    case "honorary-conflict": return task.memberId
      ? <div className={styles.panelForms}>
        <p className={styles.panelNote}>{task.body} Refunds are never issued automatically.</p>
        <form action={resolveHonoraryPaymentConflict} className="stack-form"><input type="hidden" name="member_id" value={task.memberId}/><label>Decision<select name="decision"><option value="retain">Keep the payment on record; no refund</option><option value="handled-in-stripe">Payment handled through the online payment service</option></select></label><label>Reason for the decision<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></Actions></form>
      </div>
      : <p className={styles.panelNote}>{task.body}</p>;
    case "refund": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>Membership was denied after payment. Hand the money back, then record it here.</p>
      <form action={recordDeniedMembershipRefund} className="stack-form"><input type="hidden" name="application_id" value={task.applicationId}/><label>How it was refunded<textarea name="note" rows={3} minLength={5} maxLength={400} placeholder="For example: handed back £20 in cash on 20 September." required/></label><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Mark as refunded</PendingSubmitButton></Actions></form>
    </div>;
    case "unapplied-payment": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>This person paid by card, but their membership was not updated. {task.reason}</p>
      <p className={styles.panelNote}>Either give them their membership by hand (record it as paid) and leave the card payment as it is, or refund the card payment in Stripe. Then mark this as dealt with.</p>
      {task.technical ? <details className={styles.technical}><summary>Technical details</summary><small>{task.technical}</small></details> : null}
      <form action={resolveUnappliedMembershipPayment} className="stack-form"><input type="hidden" name="attempt_id" value={task.attemptId}/><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Mark as dealt with</PendingSubmitButton></Actions></form>
    </div>;
    case "email-delivery": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>{task.event === "bounced" ? "The address could not receive this email, and further emails to it are blocked. Correct it on the member’s record if they have a new one, or contact them another way."
        : task.event === "complained" ? "The recipient marked a membership email as unwanted, and further emails to this address are blocked. Contact them another way if they still need to hear from the Society."
        : "The email service has stopped sending to this address."}</p>
      <form action={resolveMembershipDeliveryProblem} className="stack-form"><input type="hidden" name="event_id" value={task.eventId}/><Actions task={task}><PendingSubmitButton pendingLabel="Saving…">Mark as dealt with</PendingSubmitButton></Actions></form>
    </div>;
    case "email-retry": return <div className={styles.panelForms}>
      <p className={styles.panelNote}>The email could not be delivered. Correct the address, retry delivery, or contact the member another way.</p>
      {task.error ? <details className={styles.technical}><summary>Technical details</summary><small>{task.error}</small></details> : null}
      <div className={styles.actionRow}>{task.memberId ? memberLink(task.memberId, "Correct this member’s contact details") : <span/>}<form action={retryMembershipNotification}><input type="hidden" name="notification_id" value={task.notificationId}/><PendingSubmitButton pendingLabel="Requesting retry…">Retry email</PendingSubmitButton></form></div>
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
  const verification = task.type === "verification" ? verificationSections(task) : null;
  return <SidePanel closeHref={closeHref} label={`${kindPillLabel[task.kind]}: ${task.name}`} eyebrow={kindPillLabel[task.kind]} eyebrowClassName={pillClass[task.kind]} title={task.name}>
    {verification ? <>
      {verification.warning ? <p className={styles.panelWarn} role="note">{verification.warning}</p> : null}
      {verification.sections.map((section) => <section key={section.title} className={styles.factsGroup}>
        <h3 className={styles.factsTitle}>{section.title}</h3>
        <dl className={styles.facts}>{section.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>)}
    </> : rows.length ? <dl className={styles.facts}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    <Form task={task}/>
    {task.memberId && task.type !== "email-retry" && !recordLinkInForm.has(task.type) ? memberLink(task.memberId, "Open full membership record") : null}
  </SidePanel>;
}
