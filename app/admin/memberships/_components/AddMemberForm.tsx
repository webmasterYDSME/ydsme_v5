"use client";

import { useActionState, useEffect, useRef } from "react";
import { createOfficerManagedMembership } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { membershipErrorMessage } from "@/lib/membership-admin/messages";
import { emptyOfficerMemberState } from "@/lib/membership-admin/officer-member";
import { OfficerMembershipEligibilityFields } from "../OfficerMembershipEligibilityFields";
import styles from "../memberships.module.css";

type Plan = { id: string; slug: string; name: string; minimum_age: number; maximum_age: number };
type Price = { plan_id: string; membership_year: number; amount_pence: number };

/**
 * The Add a membership form. A failed attempt comes back with an explanation and everything the
 * officer typed, so nothing has to be entered again.
 */
export function AddMemberForm({ plans, prices, today }: { plans: Plan[]; prices: Price[]; today: string }) {
  const [state, formAction] = useActionState(createOfficerManagedMembership, emptyOfficerMemberState);
  const { values } = state;
  const value = (name: string) => values[name] ?? "";
  const ticked = (name: string) => values[name] === "on";
  const message = state.error ? membershipErrorMessage(state.error) ?? "The membership could not be added. Check the details and try again." : null;
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error) alert.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [state]);

  return <form action={formAction} className={`editor-form ${styles.addForm} membership-manual-create-form`}>
    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>About the member</h3>
      <div className={`${styles.fieldGrid} ${styles.nameRow}`}>
        <label>Full name<input name="full_name" defaultValue={value("full_name")} required/></label>
        <label>Title <em>Optional</em><input name="title" defaultValue={value("title")} maxLength={10}/></label>
      </div>
      <OfficerMembershipEligibilityFields
        key={state.attempt}
        today={today}
        plans={plans}
        prices={prices}
        initial={{ dateOfBirth: value("date_of_birth"), startDate: value("received_on"), student: ticked("student_declaration") }}
      />
    </section>
    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>Contact details</h3>
      <div className={styles.fieldGrid}>
        <label>Email address <em>Optional</em><input type="email" name="contact_email" defaultValue={value("contact_email")}/></label>
        <label>Telephone number <em>Optional</em><input name="contact_number" defaultValue={value("contact_number")}/></label>
      </div>
      <details className={styles.disclosure} open={Boolean(value("address_line_one") || value("address_line_two") || value("city") || value("postcode")) || undefined}>
        <summary>Add a postal address</summary>
        <div className={styles.fieldGrid}>
          <label>Address line 1<input name="address_line_one" defaultValue={value("address_line_one")}/></label>
          <label>Address line 2<input name="address_line_two" defaultValue={value("address_line_two")}/></label>
          <label>Town or city<input name="city" defaultValue={value("city")}/></label>
          <label>Postcode<input name="postcode" defaultValue={value("postcode")}/></label>
        </div>
      </details>
    </section>
    <section className={styles.formSection}>
      <details className={styles.disclosure} open={Boolean(value("guardian_name") || value("guardian_email") || value("guardian_consent_note") || state.error === "guardian-consent-required") || undefined}>
        <summary>Junior member? Add guardian details</summary>
        <p className={styles.panelNote}>Record how the guardian agreed to the membership. Their email address is optional when an officer adds the member.</p>
        <div className={styles.fieldGrid}>
          <label>Guardian’s name<input name="guardian_name" defaultValue={value("guardian_name")}/></label>
          <label>Guardian’s email <em>Optional</em><input type="email" name="guardian_email" defaultValue={value("guardian_email")}/></label>
        </div>
        <label>How consent was given<textarea name="guardian_consent_note" rows={2} defaultValue={value("guardian_consent_note")} placeholder="For example: signed paper form witnessed on 20 August 2026."/></label>
      </details>
    </section>
    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>Payment</h3>
      <p className={styles.panelNote}>Leave “Payment received in full” unticked if the money has not arrived yet.</p>
      <div className={styles.fieldGrid}>
        <label>Payment method<select name="payment_method" defaultValue={value("payment_method") || "cash"}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label>
        <label>Receipt or payment reference<input name="payment_reference" defaultValue={value("payment_reference")}/></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="payment_received" defaultChecked={ticked("payment_received")}/>Payment received in full</label>
      <label className="checkbox-row"><input type="checkbox" name="cleared" defaultChecked={ticked("cleared")}/>Cheque cleared <em>Cheque payments only</em></label>
      <details className={styles.disclosure} open={Boolean(value("duplicate_override_reason") || state.error === "possible-duplicate") || undefined}>
        <summary>Already on the register?</summary>
        <p className={styles.panelNote}>If someone with the same email address, or the same name and date of birth, is already a member, adding another record is blocked. If this really is a different person, say why here and add them again.</p>
        <label>Why is this a different person?<textarea name="duplicate_override_reason" rows={2} minLength={5} maxLength={500} defaultValue={value("duplicate_override_reason")}/></label>
      </details>
    </section>
    {message ? <p ref={alert} className="form-message error" role="alert">{message}</p> : null}
    <div className={styles.actionRow}><p className={styles.panelNote}>The membership becomes active once full payment is recorded. Unpaid ones appear under Payments in the Inbox.</p><PendingSubmitButton pendingLabel="Adding member…">Add member</PendingSubmitButton></div>
  </form>;
}
