import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SignInCard } from "@/app/components/SignInCard";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; sent?: string; next?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const query = await searchParams;
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
  return <main className="auth-page"><section className="auth-art"><Link href="/" className="auth-brand"><Image src="/ydsme-logo.png" alt="York Model Engineers" width={104} height={104}/><span>York Model Engineers</span></Link><div><p className="eyebrow">Members’ signal box</p><h1>The railway,<br/><em>between running days.</em></h1><p>Club news, private dates, minutes, publications and workshop bookings—all in one secure place.</p></div><p className="auth-foot"><ShieldCheck/> Verified access for Society members</p></section><section className="auth-panel"><div><Link href="/" className="auth-brand auth-brand-mobile"><Image src="/ydsme-logo.png" alt="" width={72} height={72}/><span>York Model Engineers</span></Link><p className="eyebrow dark">Member login</p><h2>Welcome back.</h2>{query.error ? <p className="form-message error" role="alert">{query.error}</p> : null}{query.sent ? <p className="form-message success" role="status">{query.sent === "magic-link" ? "Check your email for a secure sign-in link." : "Check your email for password reset instructions."}</p> : null}<SignInCard next={query.next || "/dashboard"}/><Link href="/" className="back-link">← Return to the public website</Link></div></section></main>;
}
