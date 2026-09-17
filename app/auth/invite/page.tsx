"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database";
import styles from "../../signin/signin.module.css";

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { detectSessionInUrl: false } },
);

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function AcceptInvitation() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function establishSession() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const next = safeNext(new URLSearchParams(window.location.search).get("next"));
      if (!accessToken || !refreshToken) {
        if (active) setError("This invitation link is invalid or has expired.");
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        if (active) setError("This invitation link is invalid or has expired.");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      router.replace(next);
    }
    void establishSession();
    return () => { active = false; };
  }, [router]);

  return <main className={`auth-page ${styles.signin}`}>
    <section className="auth-panel" aria-labelledby="invitation-title">
      <div>
        <Link href="/" className="back-link">← Return to the public website</Link>
        <Link href="/" className="auth-brand auth-brand-mobile">
          <Image src="/ydsme-logo-detailed-gold-lions.png" alt="" width={72} height={72}/>
          <span>York Model Engineers</span>
        </Link>
        <h1 id="invitation-title" className={styles.heading}>{error ? "This invitation cannot be used." : "Opening your account…"}</h1>
        <p className={error ? "form-message error" : "auth-primary-help"} role={error ? "alert" : "status"}>{error || "Please wait while we check your invitation."}</p>
        {error ? <Link className="button dark" href="/signin">Sign in by email</Link> : null}
      </div>
    </section>
  </main>;
}
