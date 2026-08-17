import Image from "next/image";
import Link from "next/link";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { sendMagicLink, sendPasswordReset, signInWithPassword } from "@/lib/actions/auth";
import { CaptchaField } from "@/app/components/CaptchaField";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; sent?: string; next?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-art"><Link href="/" className="auth-brand"><Image src="/ydsme-logo.png" alt="York Model Engineers" width={104} height={104}/><span>York Model Engineers</span></Link><div><p className="eyebrow">Members’ signal box</p><h1>The railway,<br/><em>between running days.</em></h1><p>Club news, private dates, minutes, publications and workshop bookings—all in one secure place.</p></div><p className="auth-foot"><ShieldCheck/> Verified access for Society members</p></section><section className="auth-panel"><div><p className="eyebrow dark">Member login</p><h2>Welcome back.</h2><p>Use your existing Society account. Your password and membership data stay in Supabase.</p>{query.error ? <p className="form-message error" role="alert">{query.error}</p> : null}{query.sent ? <p className="form-message success" role="status">{query.sent === "magic-link" ? "Check your email for a secure sign-in link." : "Check your email for password reset instructions."}</p> : null}<form action={signInWithPassword} className="auth-form"><input type="hidden" name="next" value={query.next || "/dashboard"}/><label>Email address<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required/></label><CaptchaField/><button className="button dark" type="submit">Sign in securely <KeyRound/></button></form><details className="auth-option"><summary><Mail/>Email me a sign-in link</summary><form action={sendMagicLink} className="inline-auth-form"><input type="hidden" name="next" value={query.next || "/dashboard"}/><input aria-label="Email address for magic link" name="email" type="email" placeholder="you@example.org" required/><CaptchaField/><button type="submit">Send link</button></form></details><details className="auth-option"><summary>Forgotten your password?</summary><form action={sendPasswordReset} className="inline-auth-form"><input aria-label="Email address for password reset" name="email" type="email" placeholder="you@example.org" required/><CaptchaField/><button type="submit">Reset</button></form></details><Link href="/" className="back-link">← Return to the public website</Link></div></section></main>;
}
