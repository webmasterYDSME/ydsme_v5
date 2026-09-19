import Link from "next/link";
import { createHonoraryMember, createOfficerManagedMembership } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { londonToday } from "@/lib/membership-admin/format";
import { loadPlansAndPrices } from "@/lib/membership-admin/records";
import { OfficerMembershipEligibilityFields } from "../OfficerMembershipEligibilityFields";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

/** Adds someone who applied in person, or a new honorary member, in a side panel over the register. */
export async function AddMemberPanel({ mode, closeHref }: { mode: "member" | "honorary"; closeHref: string }) {
  const today = londonToday();
  const nextYearStart = `${Number(today.slice(0, 4)) + 1}-01-01`;
  const { plans, prices } = mode === "member" ? await loadPlansAndPrices() : { plans: [], prices: [] };
  return <SidePanel wide key={mode} closeHref={closeHref} label="Add a member" eyebrow="Offline application" eyebrowClassName={styles.pillMute} title={mode === "member" ? "Add a membership" : "Add an honorary member"}>
    <nav className={styles.chips} aria-label="Type of member">
      <Link className={`${styles.chip} ${mode === "member" ? styles.chipOn : ""}`} href="/admin/memberships/members?add=member" prefetch={false} aria-current={mode === "member" ? "true" : undefined}>Regular membership</Link>
      <Link className={`${styles.chip} ${mode === "honorary" ? styles.chipOn : ""}`} href="/admin/memberships/members?add=honorary" prefetch={false} aria-current={mode === "honorary" ? "true" : undefined}>Lifetime honorary</Link>
    </nav>
    {mode === "member" ? <>
      <p className={styles.panelNote}>For someone who applied in person or cannot use the online application. Their membership type and amount due are worked out from their date of birth and start date.</p>
      <form action={createOfficerManagedMembership} className={`editor-form ${styles.addForm} membership-manual-create-form`}>
        <section className={styles.formSection}>
          <h3 className={styles.formTitle}>About the member</h3>
          <div className={`${styles.fieldGrid} ${styles.nameRow}`}><label>Full name<input name="full_name" required/></label><label>Title <em>Optional</em><input name="title" maxLength={10}/></label></div>
        <OfficerMembershipEligibilityFields today={today} plans={plans.filter((plan) => plan.active).map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name, minimum_age: plan.minimum_age, maximum_age: plan.maximum_age }))} prices={prices.map((price) => ({ plan_id: price.plan_id, membership_year: price.membership_year, amount_pence: price.amount_pence }))}/>
        </section>
        <section className={styles.formSection}>
          <h3 className={styles.formTitle}>Contact details</h3>
          <div className={styles.fieldGrid}><label>Email address <em>Optional</em><input type="email" name="contact_email"/></label><label>Telephone number <em>Optional</em><input name="contact_number"/></label></div>
          <details className={styles.disclosure}><summary>Add a postal address</summary><div className={styles.fieldGrid}><label>Address line 1<input name="address_line_one"/></label><label>Address line 2<input name="address_line_two"/></label><label>Town or city<input name="city"/></label><label>Postcode<input name="postcode"/></label></div></details>
        </section>
        <section className={styles.formSection}>
          <details className={styles.disclosure}><summary>Junior member? Add guardian details</summary>
            <p className={styles.panelNote}>Record how the guardian agreed to the membership. Their email address is optional when an officer adds the member.</p>
            <div className={styles.fieldGrid}><label>Guardian’s name<input name="guardian_name"/></label><label>Guardian’s email <em>Optional</em><input type="email" name="guardian_email"/></label></div>
            <label>How consent was given<textarea name="guardian_consent_note" rows={2} placeholder="For example: signed paper form witnessed on 20 August 2026."/></label>
          </details>
        </section>
        <section className={styles.formSection}>
          <h3 className={styles.formTitle}>Payment</h3>
          <p className={styles.panelNote}>Leave “Payment received in full” unticked if the money has not arrived yet.</p>
          <div className={styles.fieldGrid}><label>Payment method<select name="payment_method"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label><label>Receipt or payment reference<input name="payment_reference"/></label></div>
          <label className="checkbox-row"><input type="checkbox" name="payment_received"/>Payment received in full</label>
          <label className="checkbox-row"><input type="checkbox" name="cleared"/>Cheque cleared <em>Cheque payments only</em></label>
          <details className={styles.disclosure}><summary>Already on the register?</summary>
            <p className={styles.panelNote}>If someone with the same email address, or the same name and date of birth, is already a member, adding another record is blocked. If this really is a different person, say why here and add them again.</p>
            <label>Why is this a different person?<textarea name="duplicate_override_reason" rows={2} minLength={5} maxLength={500}/></label>
          </details>
        </section>
        <div className={styles.actionRow}><p className={styles.panelNote}>The membership becomes active once full payment is recorded. Unpaid ones appear under Payments in the Inbox.</p><PendingSubmitButton pendingLabel="Adding member…">Add member</PendingSubmitButton></div>
      </form>
    </> : <>
      <p className={styles.panelNote}>Payment-free lifetime membership. Every change needs a reason and is kept in the member’s history.</p>
      <form action={createHonoraryMember} className="stack-form">
        <label>Full name<input name="full_name" required/></label>
        <div className={styles.fieldGrid}><label>Email address <em>Optional</em><input name="contact_email" type="email"/></label><label>Telephone number <em>Optional</em><input name="contact_number"/></label></div>
        <label>Start date<input name="effective_from" type="date" min={today} defaultValue={nextYearStart} required/></label>
        <label>Reason for honorary membership<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
        <div className={styles.actionRow}><span/><PendingSubmitButton pendingLabel="Adding…">Add honorary member</PendingSubmitButton></div>
      </form>
    </>}
  </SidePanel>;
}
