"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const backToPreferences = (key: "notice" | "error", value: string): never => redirect(`/account?${key}=${value}#email-preferences`);

/** Subscribes the signed-in member to the Society newsletter, or takes them off it. System emails are not affected. */
export async function setNewsletterPreference(formData: FormData) {
  const { user } = await requireUser();
  const choice = formData.get("subscribe");
  if (choice !== "yes" && choice !== "no") return backToPreferences("error", "newsletter-failed");
  if (!await consumeRateLimit("account-newsletter", 20, 60 * 60, user.id)) return backToPreferences("error", "newsletter-rate-limited");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_own_newsletter_preference", { p_subscribe: choice === "yes" });
  if (error) {
    const reason = error.message.includes("newsletter_address_blocked") ? "newsletter-address-blocked"
      : error.message.includes("newsletter_email_required") ? "newsletter-email-required"
        : error.message.includes("newsletter_member_not_found") ? "newsletter-no-membership"
          : "newsletter-failed";
    return backToPreferences("error", reason);
  }
  revalidatePath("/account");
  return backToPreferences("notice", choice === "yes" ? "newsletter-subscribed" : "newsletter-unsubscribed");
}
