import "server-only";
import { cookies } from "next/headers";
import { membershipTokenHash } from "@/lib/membership";
import { createServiceClient } from "@/lib/supabase/admin";

export const membershipSignupCookieName = "membership_signup";
export const membershipSignupRecoverySeconds = 7 * 24 * 60 * 60;

export async function getSignupVerification() {
  const token = (await cookies()).get(membershipSignupCookieName)?.value;
  if (!token) return null;
  const recoveryCutoff = new Date(Date.now() - membershipSignupRecoverySeconds * 1000).toISOString();
  const { data } = await createServiceClient().from("membership_signup_sessions").select("*")
    .eq("session_hash", membershipTokenHash(token)).gt("expires_at", new Date().toISOString())
    .gt("sent_at", recoveryCutoff).maybeSingle();
  return data?.verified_at ? data : null;
}

export async function clearSignupVerification() {
  (await cookies()).delete(membershipSignupCookieName);
}
