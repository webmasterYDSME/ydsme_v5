import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

type CountResult = { count: number | null; error: unknown };

function safeCount(result: CountResult) {
  return result.error ? 0 : result.count ?? 0;
}

export async function getMembershipNavigationTaskCount() {
  const admin = createServiceClient();
  const results = await Promise.all([
    admin.from("membership_applications").select("id", { count: "exact", head: true })
      .in("status", ["awaiting_approval", "awaiting_cash", "awaiting_bank_transfer", "awaiting_cheque"]),
    admin.from("membership_terms").select("id", { count: "exact", head: true }).eq("status", "payment_review"),
    admin.from("membership_terms").select("id", { count: "exact", head: true })
      .eq("status", "scheduled").not("expected_payment_method", "is", null),
    admin.from("membership_checkout_attempts").select("id", { count: "exact", head: true })
      .in("status", ["failed", "payment_review"]),
    admin.from("stripe_webhook_events").select("stripe_event_id", { count: "exact", head: true })
      .eq("processing_status", "failed"),
    admin.from("membership_provider_commands").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("membership_notifications").select("id", { count: "exact", head: true }).eq("email_status", "failed"),
    admin.from("membership_migration_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("membership_plan_transitions").select("id", { count: "exact", head: true })
      .eq("status", "awaiting_student_review"),
  ]);

  const paymentConfigurationMissing = !((process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY)
    && (process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET));
  const localEmail = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(process.env.NEXT_PUBLIC_SITE_URL || "")
    && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    && Boolean(process.env.LOCAL_MAILPIT_URL);
  const emailConfigurationMissing = !(process.env.MEMBERSHIP_FROM_EMAIL
    && (localEmail || (process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET)));

  return results.reduce((total, result) => total + safeCount(result), 0)
    + Number(paymentConfigurationMissing)
    + Number(emailConfigurationMissing);
}
