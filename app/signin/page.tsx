import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { SignInCard } from "@/app/components/SignInCard";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./signin.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; sent?: string; next?: string; method?: string; notice?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const query = await searchParams;
  const isMagicLinkSent = query.sent === "magic-link";
  const isPasswordResetSent = query.sent === "password-reset";
  const isEmailSent = isMagicLinkSent || isPasswordResetSent;
  const initialMode = query.method === "password" || query.method === "password-reset" ? query.method : undefined;

  if (query.error === "Your Society access is not active.") {
    const user = await getCurrentUser();
    if (user) {
      const { data: profile } = await createAdminClient()
        .from("users")
        .select("membership_status")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.membership_status === "active") redirect("/dashboard");
    }
  }
  return (
    <main className={`auth-page ${styles.signin}`}>
      <section className="auth-art">
        <Link href="/" className="auth-brand">
          <Image src="/ydsme-logo-detailed-gold-lions.png" alt="York Model Engineers" width={104} height={104} />
          <span>York Model Engineers</span>
        </Link>
        <div>
          <p className="eyebrow">Members’ signal box</p>
          <h1>The railway,<br /><em>between running days.</em></h1>
          <p>Club news, private dates, minutes, publications and workshop bookings—all in one secure place.</p>
        </div>
        <p className="auth-foot"><ShieldCheck /> Verified access for Society members</p>
      </section>

      <section className="auth-panel">
        <div>
          <Link href="/" className="back-link">← Return to the public website</Link>
          <Link href="/" className="auth-brand auth-brand-mobile">
            <Image src="/ydsme-logo-detailed-gold-lions.png" alt="" width={72} height={72} />
            <span>York Model Engineers</span>
          </Link>
          {isEmailSent ? <p className="eyebrow dark">{isMagicLinkSent ? "Sign-in link requested" : "Password reset requested"}</p> : null}
          <h1 className={styles.heading}>{isEmailSent ? "Check your email." : "Welcome back."}</h1>
          {query.notice === "account-switched" ? <p className="form-message success">The other account has been signed out. Use the email address that received the membership message.</p> : null}
          {query.error ? <p className="form-message error" role="alert">{query.error}</p> : null}

          {isEmailSent ? (
            <div className="auth-link-confirmation" role="status" aria-live="polite">
              <span className="auth-link-confirmation-icon" aria-hidden="true"><MailCheck /></span>
              <div>
                <h3>{isMagicLinkSent ? "Look for an email from the Society." : "Password reset instructions are on their way."}</h3>
                <p>{isMagicLinkSent ? "If the email address you entered matches an active membership, you’ll receive an email from us. Open it and click the sign-in link. You won’t need a password." : "If that email belongs to an active member account, we’ve sent instructions for choosing a new password. Open the link in the email to continue."}</p>
                <p className="auth-link-confirmation-note">It may take a minute to arrive. Please check your spam or junk folder too.</p>
              </div>
              <Link href={isPasswordResetSent ? "/signin?method=password-reset" : "/signin"} className="button outline">Try another email</Link>
            </div>
          ) : (
            <SignInCard next={query.next || "/dashboard"} initialMode={initialMode} />
          )}

        </div>
      </section>
    </main>
  );
}
