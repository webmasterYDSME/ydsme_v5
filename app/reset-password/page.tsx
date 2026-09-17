import { updatePassword } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { SubmitOnEnterPassword } from "@/app/components/SubmitOnEnterPassword";
import Image from "next/image";
import Link from "next/link";
import styles from "../signin/signin.module.css";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className={`auth-page ${styles.signin}`}>
    <section className="auth-panel" aria-labelledby="reset-password-title">
      <div>
        <Link href="/" className="back-link">← Return to the public website</Link>
        <Link href="/" className="auth-brand auth-brand-mobile">
          <Image src="/ydsme-logo-detailed-gold-lions.png" alt="" width={72} height={72}/>
          <span>York Model Engineers</span>
        </Link>
        <h1 id="reset-password-title" className={styles.heading}>Choose a new password.</h1>
        <p className="auth-primary-help">Use at least 8 characters.</p>
        {error ? <p className="form-message error" role="alert">{error}</p> : null}
        <form action={updatePassword} className="auth-form">
          <div className="auth-field">
            <label htmlFor="new-password">New password</label>
            <SubmitOnEnterPassword id="new-password" name="password" minLength={8} autoComplete="new-password" allowReveal required/>
          </div>
          <PendingSubmitButton className="button dark" pendingLabel="Updating…">Update password</PendingSubmitButton>
        </form>
      </div>
    </section>
  </main>;
}
