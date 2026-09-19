"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { readPostcode } from "@/lib/membermojo-list";
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

const backToAddress = (key: "notice" | "error", value: string): never => redirect(`/account?${key}=${value}#address`);

const addressForm = z.object({
  address_line_one: z.string().trim().max(180),
  address_line_two: z.string().trim().max(180),
  city: z.string().trim().max(100),
  postcode: z.string().trim().max(20),
  date_of_birth: z.string().trim().max(10).optional(),
});

/**
 * Saves the member's own postal address and, when allowed, the missing day of their date of birth.
 * The database decides whether a date of birth may change; it is only ever accepted when it was blank or a
 * month and year with a placeholder day.
 */
export async function updateMemberDetails(formData: FormData) {
  const { user } = await requireUser();
  const parsed = addressForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return backToAddress("error", "address-invalid");
  const birthDate = parsed.data.date_of_birth ? z.iso.date().safeParse(parsed.data.date_of_birth) : null;
  if (birthDate && !birthDate.success) return backToAddress("error", "address-birth-date-invalid");
  if (!await consumeRateLimit("account-details", 20, 60 * 60, user.id)) return backToAddress("error", "address-rate-limited");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_member_details", {
    p_address_line_one: parsed.data.address_line_one,
    p_address_line_two: parsed.data.address_line_two,
    p_city: parsed.data.city,
    p_postcode: parsed.data.postcode ? readPostcode(parsed.data.postcode) : "",
    p_date_of_birth: birthDate?.data,
  });
  if (error) {
    const reason = error.message.includes("member_birth_date_locked") ? "address-birth-date-locked"
      : error.message.includes("member_birth_date_invalid") ? "address-birth-date-invalid"
        : error.message.includes("member_details_invalid") ? "address-invalid"
          : error.message.includes("member_details_member_not_found") ? "address-no-membership"
            : "address-failed";
    return backToAddress("error", reason);
  }
  revalidatePath("/account");
  return backToAddress("notice", "address-updated");
}

/** Marks every unread membership notice as read. */
export async function markAllMembershipNotificationsRead() {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_own_membership_notifications", { p_limit: 50 });
  await Promise.all((data ?? []).filter((notice) => !notice.read_at)
    .map((notice) => supabase.rpc("mark_own_membership_notification_read", { p_notification_id: notice.id })));
  revalidatePath("/account");
}
