"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";

const emailSchema = z.string().trim().email().max(254);
const existingPasswordSchema = z.string().min(6).max(128);
const newPasswordSchema = z.string().min(8).max(128);

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/dashboard";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function authError(message: string): never {
  redirect(`/signin?error=${encodeURIComponent(message)}`);
}

function passwordAuthError(message: string, formData: FormData): never {
  const query = new URLSearchParams({
    error: message,
    method: "password",
    next: safeNext(formData.get("next")),
  });
  redirect(`/signin?${query.toString()}`);
}

function passwordResetAuthError(message: string): never {
  const query = new URLSearchParams({ error: message, method: "password-reset" });
  redirect(`/signin?${query.toString()}`);
}

export async function signInWithPassword(formData: FormData) {
  const parsed = z.object({ email: emailSchema, password: existingPasswordSchema }).safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!parsed.success) passwordAuthError("Enter a valid email address and password.", formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken: String(formData.get("captchaToken") || "") } });
  if (error) passwordAuthError("We could not sign you in. Check your details and try again.", formData);
  redirect(safeNext(formData.get("next")));
}

export async function sendMagicLink(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) authError("Enter a valid email address.");
  const origin = getTrustedAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next")))}`, shouldCreateUser: false, captchaToken: String(formData.get("captchaToken") || "") },
  });
  if (error) authError("We could not send the sign-in link. Please try again.");
  redirect("/signin?sent=magic-link");
}

export async function sendPasswordReset(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) passwordResetAuthError("Enter a valid email address.");
  const origin = getTrustedAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
    captchaToken: String(formData.get("captchaToken") || ""),
  });
  if (error) passwordResetAuthError("We could not send the reset email. Please try again.");
  redirect("/signin?sent=password-reset");
}

export async function switchPortalAccount(formData: FormData) {
  if (!(await membershipBillingEnabled())) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/signin?next=${encodeURIComponent(next)}&notice=account-switched`);
}

export async function updatePassword(formData: FormData) {
  await requireUser();
  const parsed = newPasswordSchema.safeParse(formData.get("password"));
  if (!parsed.success) redirect("/reset-password?error=Password+must+be+at+least+8+characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) redirect("/reset-password?error=The+password+could+not+be+updated.");
  redirect("/dashboard?notice=password-updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateLoginEmail(formData: FormData) {
  await requireUser();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/account?error=Enter+a+valid+email+address.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  if (error) redirect("/account?error=The+login+email+could+not+be+updated.");
  redirect("/account?notice=email-confirmation-sent");
}
