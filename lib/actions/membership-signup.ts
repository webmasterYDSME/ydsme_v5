"use server";

import { cookies } from "next/headers";
import { createHmac, randomInt } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { membershipToken, membershipTokenHash, refreshMembershipApplicationPaymentLink } from "@/lib/membership";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendTransactionalEmail } from "@/lib/email-delivery";
import { membershipVerificationEmail } from "@/lib/membership-verification-email";
import { membershipBillingEnabled } from "@/lib/features";

import {
  getSignupVerification,
  membershipSignupCookieName,
  membershipSignupRecoverySeconds,
} from "@/lib/membership-signup-session";

const normalName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
function digest(session: string, code: string) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Verification is unavailable.");
  return createHmac("sha256", secret).update(`${session}:${code}`).digest("hex");
}
export async function requestSignupCode(form: FormData) {
  if (!membershipBillingEnabled()) return { error: "Membership applications are unavailable." };
  const parsed = z.object({ email: z.email().max(254), fullName: z.string().trim().min(2).max(180) }).safeParse({
    email: String(form.get("email") || "").trim().toLowerCase(), fullName: form.get("fullName"),
  });
  if (!parsed.success) return { error: "Enter the applicant’s full name and a valid email address." };
  if (!await verifyTurnstile(String(form.get("captchaToken") || ""))) return { error: "Please complete the security check and try again." };
  const admin = createServiceClient();
  // Address-independent bucket prevents distributed guessing/sending to a single mailbox.
  const { data: emailAllowed, error } = await admin.rpc("consume_rate_limit", { p_scope: "signup-code-email",
    p_subject_hash: digest("email", parsed.data.email), p_max_attempts: 5, p_window_seconds: 3600 });
  const { data: cooldown } = await admin.rpc("consume_rate_limit", { p_scope: "signup-code-cooldown",
    p_subject_hash: digest("email", parsed.data.email), p_max_attempts: 1, p_window_seconds: 60 });
  const { data: globalAllowed } = await admin.rpc("consume_rate_limit", { p_scope: "signup-code-global", p_subject_hash: digest("global", "signup"), p_max_attempts: 200, p_window_seconds: 3600 });
  if (!globalAllowed || error || !emailAllowed || !cooldown || !await consumeRateLimit("signup-code-ip", 20, 3600)) return { error: "Please wait before requesting another code." };
  const token = membershipToken();
  const sessionHash = membershipTokenHash(token);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const jar = await cookies();
  const previous = jar.get(membershipSignupCookieName)?.value;
  if (previous) await admin.from("membership_signup_sessions").update({ code_hash: null, verified_at: null })
    .eq("session_hash", membershipTokenHash(previous));
  const { error: insertError } = await admin.from("membership_signup_sessions").insert({
    session_hash: sessionHash, email: parsed.data.email, full_name: normalName(parsed.data.fullName),
    code_hash: digest(sessionHash, code), code_expires_at: new Date(Date.now() + 600_000).toISOString(),
    expires_at: new Date(Date.now() + membershipSignupRecoverySeconds * 1000).toISOString(),
  });
  if (insertError) return { error: "Unable to send a code. Please try again." };
  const sent = await sendTransactionalEmail({ from: process.env.MEMBERSHIP_FROM_EMAIL || process.env.BOOKINGS_FROM_EMAIL || "York Model Engineers <membership@yorkmodelengineers.co.uk>",
    to: [parsed.data.email], ...membershipVerificationEmail(code),
  });
  if (!sent.sent) { await admin.from("membership_signup_sessions").delete().eq("session_hash", sessionHash); return { error: "We could not send the code. Please try again." }; }
  jar.set(membershipSignupCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http://127.0.0.1"), sameSite: "lax", path: "/", maxAge: membershipSignupRecoverySeconds });
  return { sent: true };
}
export async function verifySignupCode(code: string) {
  if (!membershipBillingEnabled() || !/^\d{6}$/.test(code)) return { error: "Enter the six-digit code." };
  const token = (await cookies()).get(membershipSignupCookieName)?.value;
  if (!token || !await consumeRateLimit("signup-code-verify", 30, 3600)) return { error: "Request a new code." };
  const hash = membershipTokenHash(token);
  const { data, error } = await createServiceClient().rpc("verify_membership_signup_code", { p_session_hash: hash, p_code_hash: digest(hash, code) });
  if (error || data !== true) return { error: "The code is incorrect, expired or has been used. Request a new code if needed." };
  const session = await getSignupVerification();
  if (!session) return { error: "Request a new code." };
  const admin = createServiceClient();
  const { data: candidates } = await admin.from("members").select("id,full_name,effective_state")
    .eq("contact_email", session.email);
  const member = candidates?.find(item => normalName(item.full_name) === session.full_name);
  if (member) return { verified: true, existing: true, message: ["suspended","archived"].includes(member.effective_state)
    ? "Please contact the membership officer about your membership. No new joining payment is needed."
    : "An existing membership matches this name and email. Continue to your account or contact the membership officer to renew. If this is a different person with the same name, contact the officer." };
  const { data: applications } = await admin.from("membership_applications").select("id,full_name,status")
    .eq("contact_email", session.email).not("status", "in", "(expired,converted)");
  const application = applications?.find(item => normalName(item.full_name) === session.full_name);
  if (application?.status === "awaiting_payment") {
    const href = await refreshMembershipApplicationPaymentLink(application.id);
    return { verified: true, existing: true, href: href ?? undefined, message: "Your application is saved. Continue your existing payment; no second application is needed." };
  }
  if (application) return { verified: true, existing: true, message: "Your application is already saved. Contact the membership officer about the next step." };
  const { data: drafts } = await admin.from("membership_signup_sessions").select("draft")
    .eq("email", session.email).eq("full_name", session.full_name).neq("draft", "{}")
    .neq("id", session.id).gt("expires_at", new Date().toISOString()).order("sent_at", { ascending: false }).limit(1);
  return { verified: true, draft: drafts?.[0]?.draft, message: candidates?.length
    ? "Email verified. This shared address can receive correspondence, but this membership will not get a separate portal account if the address already has one."
    : "Email verified." };
}
export async function saveSignupDraft(form: FormData) {
  const verified = await getSignupVerification();
  if (!verified) return;
  const email = String(form.get("guardian_led") === "on" ? form.get("guardian_email") : form.get("contact_email")).trim().toLowerCase();
  if (verified.email !== email || verified.full_name !== normalName(String(form.get("full_name") || ""))) return;
  const allowed = ["title","full_name","contact_email","contact_number","date_of_birth","plan_id","guardian_name","guardian_email","guardian_consent","guardian_led","student_declaration","payment_method"];
  const draft = Object.fromEntries(allowed.map(key => [key, String(form.get(key) || "").slice(0, 254)]));
  await createServiceClient().from("membership_signup_sessions").update({ draft }).eq("id", verified.id);
}
