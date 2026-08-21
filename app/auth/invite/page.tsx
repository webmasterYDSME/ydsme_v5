"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database";

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

  return <main className="simple-auth"><div>
    <p className="eyebrow dark">Member invitation</p>
    <h1>{error ? "This invitation cannot be used." : "Opening your account…"}</h1>
    <p className={error ? "form-message error" : undefined}>{error || "Please wait while the secure invitation is confirmed."}</p>
    {error ? <Link className="button dark" href="/signin">Request a secure sign-in link</Link> : null}
  </div></main>;
}
