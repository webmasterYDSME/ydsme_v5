import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { switchPortalAccount } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import styles from "../../signin/signin.module.css";

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

export default async function SwitchAccount({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const [{ next }, currentUser] = await Promise.all([searchParams, getCurrentUser()]);
  const destination = safeNext(next);
  if (!currentUser) redirect(`/signin?next=${encodeURIComponent(destination)}`);

  return <main className={`auth-page ${styles.signin}`}><section className="auth-panel" aria-labelledby="switch-account-title"><div>
    <Link href="/" className="back-link">← Return to the public website</Link>
    <Link href="/" className="auth-brand auth-brand-mobile">
      <Image src="/ydsme-logo-detailed-gold-lions.png" alt="" width={72} height={72}/>
      <span>York Model Engineers</span>
    </Link>
    <h1 id="switch-account-title" className={styles.heading}>Use another account.</h1>
    <p className="auth-primary-help">You’re already signed in to a Society account. Sign out to use the email address that received your membership message.</p>
    <form action={switchPortalAccount} className="auth-form">
      <input type="hidden" name="next" value={destination}/>
      <PendingSubmitButton className="button dark" pendingLabel="Signing out…">Sign out and continue</PendingSubmitButton>
    </form>
  </div></section></main>;
}
