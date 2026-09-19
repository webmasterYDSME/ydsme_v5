"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createOfficerManagedMembership, findPossibleDuplicateMembers } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { dateLabel, memberStateName, money } from "@/lib/membership-admin/format";
import { membershipErrorMessage } from "@/lib/membership-admin/messages";
import {
  emptyOfficerMemberState,
  guardianConsentMethods,
  newsletterConsentSources,
  type OfficerMemberState,
  type PossibleDuplicate,
} from "@/lib/membership-admin/officer-member";
import { membershipPhoneHint, membershipPhonePattern } from "@/lib/membership-phone";
import { OfficerFeeSummary, OfficerMembershipEligibilityFields, useOfficerEligibility } from "../OfficerMembershipEligibilityFields";
import styles from "../memberships.module.css";

type Plan = { id: string; slug: string; name: string; minimum_age: number; maximum_age: number };
type Price = { plan_id: string; membership_year: number; amount_pence: number };
type Props = { plans: Plan[]; prices: Price[]; today: string; closeHref: string };

/**
 * The Add a membership form. A failed attempt comes back with an explanation and everything the
 * officer typed. A successful one shows what was added, with a way to add another.
 */
export function AddMemberForm(props: Props) {
  const [session, setSession] = useState(0);
  return <AddMemberSession key={session} {...props} onAnother={() => setSession((current) => current + 1)}/>;
}

function AddMemberSession({ closeHref, onAnother, ...rest }: Props & { onAnother: () => void }) {
  const [state, formAction] = useActionState(createOfficerManagedMembership, emptyOfficerMemberState);
  if (state.created) return <Created created={state.created} closeHref={closeHref} onAnother={onAnother}/>;
  // Rebuilt after every failed attempt, so the date fields start from what was typed.
  return <Fields key={state.attempt} state={state} formAction={formAction} {...rest}/>;
}

function Created({ created, closeHref, onAnother }: { created: NonNullable<OfficerMemberState["created"]>; closeHref: string; onAnother: () => void }) {
  return <div className={styles.panelForms} data-discard-safe="">
    <section className={styles.formSection} role="status">
      <h3 className={styles.formTitle}>Membership added</h3>
      <dl className={styles.facts}>
        <div><dt>Member</dt><dd>{created.name}</dd></div>
        <div><dt>Membership</dt><dd>{created.planName} · {created.year}</dd></div>
        <div><dt>Payment</dt><dd>{created.paid ? `Paid in full · ${money(created.amountPence)}` : `${money(created.amountPence)} still to collect`}</dd></div>
        <div><dt>Newsletter</dt><dd>{created.newsletter ? "Subscribed, consent recorded" : "Not subscribed"}</dd></div>
      </dl>
      <p className={styles.panelNote}>{created.paid ? "The membership is active." : "It appears under Payments in the Inbox until the money arrives."}</p>
    </section>
    <div className={styles.actionRow}>
      <Link className={styles.linkButton} href={`/admin/memberships/members/${created.memberId}`}>Open full membership record</Link>
      <span className={styles.buttonPair}>
        <button type="button" className="button outline" onClick={onAnother}>Add another</button>
        <Link className="pending-submit" href={closeHref}>Done</Link>
      </span>
    </div>
  </div>;
}

const paymentMethods = { cash: "Cash", bank_transfer: "Bank transfer", cheque: "Cheque" } as const;

function Fields({ state, formAction, plans, prices, today }: { state: OfficerMemberState; formAction: (formData: FormData) => void } & Omit<Props, "closeHref">) {
  const { values } = state;
  const value = (name: string) => values[name] ?? "";
  const eligibility = useOfficerEligibility({
    plans, prices, today,
    initial: { dateOfBirth: value("date_of_birth"), startDate: value("received_on"), student: values.student_declaration === "on" },
  });
  const [name, setName] = useState(value("full_name"));
  const [email, setEmail] = useState(value("contact_email"));
  const [newsletter, setNewsletter] = useState(values.newsletter_opt_in === "on");
  const [paid, setPaid] = useState(values.payment_received === "on");
  const [method, setMethod] = useState<keyof typeof paymentMethods>((value("payment_method") || "cash") as keyof typeof paymentMethods);
  const [matches, setMatches] = useState<PossibleDuplicate[]>([]);
  // The newsletter is emailed, so it can only be offered once there is an address (and is dropped if the address is cleared).
  const hasEmail = email.trim() !== "";
  const newsletterOn = hasEmail && newsletter;
  const junior = eligibility.selected?.slug === "junior";
  const message = state.error ? membershipErrorMessage(state.error) ?? "The membership could not be added. Check the details and try again." : null;
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error) alert.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [state.error, state.attempt]);

  // Looks for someone already on the register once there is enough to compare, so a duplicate is caught before the form is sent.
  const { dateOfBirth } = eligibility;
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      // Nothing to compare yet: a name needs a date of birth alongside it.
      if (!email.trim() && !(name.trim().length > 1 && dateOfBirth)) { if (current) setMatches([]); return; }
      try {
        const found = await findPossibleDuplicateMembers({ full_name: name, date_of_birth: dateOfBirth, contact_email: email });
        if (current) setMatches(found);
      } catch {
        if (current) setMatches([]);
      }
    }, 500);
    return () => { current = false; clearTimeout(timer); };
  }, [name, dateOfBirth, email]);
  const duplicate = matches.length > 0 || state.error === "possible-duplicate";

  return <form action={formAction} className={`editor-form ${styles.addForm} membership-manual-create-form`}>
    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>About the member</h3>
      <div className={`${styles.fieldGrid} ${styles.nameRow}`}>
        <label>Full name<input name="full_name" value={name} onChange={(event) => setName(event.target.value)} required/></label>
        <label>Title <em>Optional</em><input name="title" defaultValue={value("title")} maxLength={10}/></label>
      </div>
      <OfficerMembershipEligibilityFields eligibility={eligibility}/>
      {duplicate ? <div className={styles.panelWarn} role="status">
        {matches.length ? <>
          <p>Already on the register:</p>
          <ul>{matches.map((match) => <li key={match.id}>
            <Link href={`/admin/memberships/members/${match.id}`} target="_blank" rel="noreferrer">{match.name}<span className="sr-only"> (opens in a new tab)</span></Link> · {memberStateName(match.state)} · same {match.matchedOn}
          </li>)}</ul>
        </> : <p>Someone with the same email address, or the same name and date of birth, is already on the register.</p>}
        <label>If this is a different person, say why<textarea name="duplicate_override_reason" rows={2} minLength={5} maxLength={500} defaultValue={value("duplicate_override_reason")} placeholder="They share the same email address" required/></label>
      </div> : null}
    </section>

    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>Contact details</h3>
      <div className={styles.fieldGrid}>
        <label>Email address <em>Optional</em><input type="email" name="contact_email" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
        <label>Telephone number <em>Optional</em><input type="tel" name="contact_number" defaultValue={value("contact_number")} pattern={membershipPhonePattern} title={membershipPhoneHint}/></label>
      </div>
      <p className={styles.panelNote}>{hasEmail
        ? paid ? "An invitation to the member portal is emailed as soon as the member is added." : "An invitation to the member portal is emailed once payment is recorded."
        : "If no email address is entered, this member will not have access to the member portal."}</p>
      {hasEmail ? <label className="checkbox-row"><input type="checkbox" name="newsletter_opt_in" checked={newsletter} onChange={(event) => setNewsletter(event.target.checked)}/>They would like the Society newsletter <em>Optional</em></label> : null}
      {newsletterOn ? <div className={styles.consentBox}>
        <p className={styles.panelNote}>Only tick this if they have agreed. How and when they agreed is kept as their consent record.</p>
        <div className={styles.fieldGrid}>
          <label>How did they agree?<select name="newsletter_consent_source" defaultValue={value("newsletter_consent_source") || "paper_form"} required>{Object.entries(newsletterConsentSources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Date agreed<input type="date" name="newsletter_consent_given_on" defaultValue={value("newsletter_consent_given_on") || today} max={today} required/></label>
        </div>
      </div> : null}
      <details className={styles.disclosure} open={Boolean(value("address_line_one") || value("address_line_two") || value("city") || value("postcode")) || undefined}>
        <summary>Add a postal address</summary>
        <div className={styles.fieldGrid}>
          <label>Address line 1<input name="address_line_one" defaultValue={value("address_line_one")}/></label>
          <label>Address line 2<input name="address_line_two" defaultValue={value("address_line_two")}/></label>
          <label>Town or city<input name="city" defaultValue={value("city")}/></label>
          <label>Postcode<input name="postcode" defaultValue={value("postcode")} pattern="[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\s*[0-9][A-Za-z]{2}" title="Enter a UK postcode, for example YO1 7HH."/></label>
        </div>
      </details>
    </section>

    {junior ? <section className={styles.formSection}>
      <h3 className={styles.formTitle}>Guardian</h3>
      <p className={styles.panelNote}>Junior members need a guardian’s name and a record of how the guardian agreed.</p>
      <div className={styles.fieldGrid}>
        <label>Guardian’s name<input name="guardian_name" defaultValue={value("guardian_name")} required/></label>
        <label>Guardian’s email <em>Optional</em><input type="email" name="guardian_email" defaultValue={value("guardian_email")}/></label>
        <label>How did the guardian agree?<select name="guardian_consent_method" defaultValue={value("guardian_consent_method") || "paper_form"} required>{Object.entries(guardianConsentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Date agreed<input type="date" name="guardian_consent_on" defaultValue={value("guardian_consent_on") || today} max={today} required/></label>
      </div>
      <label>Anything to add <em>Optional</em><input name="guardian_consent_detail" defaultValue={value("guardian_consent_detail")} maxLength={300} placeholder="For example: form witnessed by the treasurer."/></label>
    </section> : null}

    <section className={styles.formSection}>
      <h3 className={styles.formTitle}>Payment</h3>
      <OfficerFeeSummary eligibility={eligibility}/>
      <fieldset className={styles.segmented}>
        <legend>Payment status</legend>
        <label className="checkbox-row"><input type="radio" name="payment_received" value="off" checked={!paid} onChange={() => setPaid(false)}/>Not paid yet</label>
        <label className="checkbox-row"><input type="radio" name="payment_received" value="on" checked={paid} onChange={() => setPaid(true)}/>Paid in full</label>
      </fieldset>
      <div className={styles.fieldGrid}>
        <label>{paid ? "Paid by" : "Will pay by"}<select name="payment_method" value={method} onChange={(event) => setMethod(event.target.value as keyof typeof paymentMethods)}>{Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {paid ? <label>Receipt or payment reference<input name="payment_reference" defaultValue={value("payment_reference")} required/></label> : null}
      </div>
      {paid && method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" defaultChecked={values.cleared === "on"} required/>The cheque has cleared</label> : null}
      <p className={styles.panelNote}>{paid
        ? `Recorded as received on the start date, ${dateLabel(eligibility.startDate) || "today"}.${method === "cheque" ? " If the cheque has not cleared yet, choose “Not paid yet” and record it from the Inbox when it does." : ""}`
        : "It appears under Payments in the Inbox until the money arrives."}</p>
    </section>

    {message ? <p ref={alert} className="form-message error" role="alert">{message}</p> : null}
    <div className={`${styles.actionRow} ${styles.stickyActions}`}><span/><PendingSubmitButton pendingLabel="Adding member…">Add member</PendingSubmitButton></div>
  </form>;
}
