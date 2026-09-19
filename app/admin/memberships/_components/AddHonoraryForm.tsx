"use client";

import { useActionState, useState } from "react";
import { createHonoraryMember } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { membershipErrorMessage } from "@/lib/membership-admin/messages";
import { emptyHonoraryMemberState, type HonoraryMemberState } from "@/lib/membership-admin/officer-member";
import { membershipPhoneHint, membershipPhonePattern } from "@/lib/membership-phone";
import { DuplicateWarning, usePossibleDuplicates } from "./PossibleDuplicates";
import styles from "../memberships.module.css";

/** The Add an honorary member form. A failed attempt keeps what was typed, and nothing is added unless the whole thing succeeds. */
export function AddHonoraryForm({ today }: { today: string }) {
  const [state, formAction] = useActionState(createHonoraryMember, emptyHonoraryMemberState);
  // Rebuilt after every failed attempt, so every field starts from what was typed.
  return <Fields key={state.attempt} state={state} formAction={formAction} today={today}/>;
}

function Fields({ state, formAction, today }: { state: HonoraryMemberState; formAction: (formData: FormData) => void; today: string }) {
  const { values } = state;
  const value = (name: string) => values[name] ?? "";
  const [name, setName] = useState(value("full_name"));
  const [dateOfBirth, setDateOfBirth] = useState(value("date_of_birth"));
  const [email, setEmail] = useState(value("contact_email"));
  const [startDate, setStartDate] = useState(value("effective_from") || today);
  const matches = usePossibleDuplicates({ name, dateOfBirth, email, includeNameOnly: true });
  const message = state.error ? membershipErrorMessage(state.error) ?? "The honorary member could not be added. Check the details and try again." : null;
  return <form action={formAction} className="stack-form">
    <label>Full name<input name="full_name" value={name} onChange={(event) => setName(event.target.value)} required/></label>
    <div className={styles.fieldGrid}>
      <label>Date of birth <em>Optional</em><input type="date" name="date_of_birth" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} max={today}/></label>
      <label>Start date<input name="effective_from" type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} required/></label>
    </div>
    <div className={styles.fieldGrid}>
      <label>Email address <em>Optional</em><input name="contact_email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label>Telephone number <em>Optional</em><input type="tel" name="contact_number" defaultValue={value("contact_number")} pattern={membershipPhonePattern} title={membershipPhoneHint}/></label>
    </div>
    <p className={styles.panelNote}>{email.trim() === ""
      ? "If no email address is entered, this member will not have access to the member portal."
      : startDate > today
        ? "The start date is in the future, so no invitation to the member portal is sent yet."
        : "An invitation to the member portal is emailed as soon as the member is added."}</p>
    <p className={styles.panelNote}>The date of birth helps spot someone who is already on the register. To make an existing member honorary, open their record instead.</p>
    <DuplicateWarning matches={matches} forced={state.error === "possible-duplicate"} defaultReason={value("duplicate_override_reason")}/>
    <label>Reason for honorary membership<textarea name="reason" rows={3} minLength={5} maxLength={500} defaultValue={value("reason")} required/></label>
    {message ? <p className="form-message error" role="alert">{message}</p> : null}
    <div className={styles.actionRow}><span/><PendingSubmitButton pendingLabel="Adding…">Add honorary member</PendingSubmitButton></div>
  </form>;
}
