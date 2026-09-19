import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { updateProfile } from "@/lib/actions/content";
import { Section } from "./Section";
import styles from "../account.module.css";

/** Name, title and contact number. Saving also updates the linked membership record. */
export function ProfileSection({ title, fullName, contactNumber }: { title: string; fullName: string; contactNumber: string }) {
  return <Section id="profile" title="Your details" description="How the Society knows you. Changes here also update your membership record.">
    <form action={updateProfile} className={styles.stackForm}>
      <div className={styles.formGrid}>
        <label className={styles.field}>Title<input className={styles.input} name="title" maxLength={10} defaultValue={title} autoComplete="honorific-prefix"/></label>
        <label className={`${styles.field} ${styles.wide}`}>Full name<input className={styles.input} name="full_name" defaultValue={fullName} required autoComplete="name"/></label>
        <label className={`${styles.field} ${styles.wide}`}>Contact number<input className={styles.input} name="contact_number" type="tel" defaultValue={contactNumber} autoComplete="tel"/></label>
      </div>
      <div><PendingSubmitButton className="button dark" pendingLabel="Saving…">Save details</PendingSubmitButton></div>
    </form>
  </Section>;
}
