import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { updateLoginEmail } from "@/lib/actions/auth";
import { requestOwnMembershipContactChange } from "@/lib/actions/membership";
import { MEMBERMOJO_MEMBERSHIP_URL } from "@/lib/features";
import { Section } from "./Section";
import styles from "../account.module.css";

/** The email used to sign in, the address membership mail goes to, and (while MemberMojo runs it) the link to manage membership there. */
export function SignInSection({ loginEmail, correspondence, memberMojoLink }: {
  loginEmail: string;
  /** Only when the membership area is on and this account is linked to a membership record. */
  correspondence: { email: string; role: string } | null;
  memberMojoLink: boolean;
}) {
  return <Section id="sign-in" title="Sign-in and contact" description="The email address you sign in with, and where membership messages are sent.">
    <div className={styles.rows}>
      <div className={styles.row}>
        <div className={styles.rowText}><strong>Login email</strong><p>Used only to sign in. We ask you to confirm the new address before it changes.</p></div>
        <form action={updateLoginEmail} className={styles.controls}>
          <label className={styles.srOnly} htmlFor="new-login-email">New login email address</label>
          <input id="new-login-email" className={styles.input} type="email" name="email" defaultValue={loginEmail} autoComplete="email" required/>
          <PendingSubmitButton className="button outline" pendingLabel="Sending confirmation…">Change login email</PendingSubmitButton>
        </form>
      </div>
      {correspondence ? <div className={styles.row}>
        <div className={styles.rowText}><strong>Membership email</strong><p>Where we send membership messages. It can be a shared household address and does not change your login.</p></div>
        <form action={requestOwnMembershipContactChange} className={styles.controls}>
          <label className={styles.srOnly} htmlFor="new-membership-contact-email">New membership email address</label>
          <input id="new-membership-contact-email" className={styles.input} type="email" name="contact_email" defaultValue={correspondence.email} autoComplete="email" required/>
          <label className={styles.srOnly} htmlFor="membership-contact-role">Type of address</label>
          <select id="membership-contact-role" className={styles.select} name="contact_role" defaultValue={correspondence.role === "shared_household" ? "shared_household" : "self"}>
            <option value="self">My own address</option>
            <option value="shared_household">Shared household address</option>
          </select>
          <PendingSubmitButton className="button outline" pendingLabel="Sending verification…">Change membership email</PendingSubmitButton>
        </form>
      </div> : null}
      {memberMojoLink ? <div className={styles.row}>
        <div className={styles.rowText}><strong>Membership and renewals</strong><p>MemberMojo securely manages membership applications, renewals and payment details.</p></div>
        <div className={styles.controls}><a className="button outline" href={MEMBERMOJO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">Manage membership</a></div>
      </div> : null}
    </div>
  </Section>;
}
