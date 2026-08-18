import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  const origin = getTrustedAppOrigin();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/signin?error=The+sign-in+link+is+invalid+or+expired.", origin));
}
