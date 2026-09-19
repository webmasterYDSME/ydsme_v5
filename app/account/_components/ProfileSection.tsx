import { UserRound } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { updateProfile } from "@/lib/actions/content";
import styles from "../account.module.css";

/** Name, title and contact number. Saving also updates the linked membership record. */
export function ProfileSection({ title, fullName, contactNumber }: { title: string; fullName: string; contactNumber: string }) {
  return <section className={styles.card} id="profile" aria-labelledby="profile-heading">
    <header className={styles.cardHead}>
      <span className={styles.badge}><UserRound/></span>
      <div className={styles.headText}><h2 id="profile-heading">Your details</h2><p>How the Society knows you. Changes here also update your membership record.</p></div>
    </header>
    <form action={updateProfile} className={styles.cardBodyLoose}>
      <div className={styles.fields}>
        <label className={styles.field}>Title<input className={styles.input} name="title" maxLength={10} defaultValue={title} autoComplete="honorific-prefix"/></label>
        <label className={styles.field}>Full name<input className={styles.input} name="full_name" defaultValue={fullName} required autoComplete="name"/></label>
        <label className={styles.field}>Contact number<input className={styles.input} name="contact_number" type="tel" defaultValue={contactNumber} autoComplete="tel"/></label>
      </div>
      <div><PendingSubmitButton className="button dark" pendingLabel="Saving…">Save details</PendingSubmitButton></div>
    </form>
  </section>;
}
