import { DatePicker } from "@/app/components/DatePicker";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { updateMemberDetails } from "@/lib/actions/account";
import type { OwnMemberDetails } from "@/lib/member-details";
import { date } from "../format";
import { Section } from "./Section";
import { SectionNotice, type SectionMessage } from "./SectionMessage";
import styles from "../account.module.css";

/** Postal address and date of birth. The address is theirs to change; the date of birth is add-only (see the migration). */
export function AddressSection({ details, message, today }: { details: OwnMemberDetails | null; message: SectionMessage | null; today: string }) {
  return <Section id="address" title="Address and date of birth" description="Where we can post things to you, and your date of birth so we charge the right fee.">
    <SectionNotice message={message}/>
    {!details ? <p className={styles.empty}>We could not load these details just now. Please try again shortly.</p>
      : !details.linked ? <p className={styles.empty}>These details are kept on your membership record, and this account is not linked to one yet. A membership officer can link it for you.</p>
        : <Form details={details} today={today}/>}
  </Section>;
}

function Form({ details, today }: { details: Extract<OwnMemberDetails, { linked: true }>; today: string }) {
  return <form action={updateMemberDetails} className={styles.stackForm}>
    <div className={styles.formGrid}>
      <label className={`${styles.field} ${styles.wide}`}>Address line 1<input className={styles.input} name="address_line_one" maxLength={180} defaultValue={details.addressLineOne} autoComplete="address-line1"/></label>
      <label className={`${styles.field} ${styles.wide}`}>Address line 2<input className={styles.input} name="address_line_two" maxLength={180} defaultValue={details.addressLineTwo} autoComplete="address-line2"/></label>
      <label className={styles.field}>Town or city<input className={styles.input} name="city" maxLength={100} defaultValue={details.city} autoComplete="address-level2"/></label>
      <label className={styles.field}>Postcode<input className={styles.input} name="postcode" maxLength={20} defaultValue={details.postcode} autoComplete="postal-code"/></label>
    </div>

    {details.birthDateLocked && details.dateOfBirth ? <div className={styles.field}>
      <span>Date of birth</span>
      <p className={styles.fixedValue}>{date(details.dateOfBirth)}</p>
      <small className={styles.hint}>To correct it, please contact the membership officer.</small>
    </div> : <div className={styles.field}>
      <label htmlFor="own-date-of-birth">Date of birth</label>
      <DatePicker id="own-date-of-birth" name="date_of_birth" submissionFormat="iso" defaultValue={details.dateOfBirth ?? ""} min="1900-01-01" max={today} autoComplete="bday"/>
      <small className={styles.hint}>{details.birthDayUnconfirmed
        ? "We only have your month and year, so the 1st is shown. Add your actual day if it is different. Once you do, only a membership officer can change it."
        : "Optional. Once saved, only a membership officer can change it."}</small>
    </div>}
    <div><PendingSubmitButton className="button dark" pendingLabel="Saving…">Save address</PendingSubmitButton></div>
  </form>;
}
