import { redirect } from "next/navigation";
import { createApplicationCheckout, membershipTokenHash } from "@/lib/membership";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.length < 20 || token.length > 200) redirect("/membership?application=link-invalid");
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("id,status,payment_method,requested_plan_id,verification_expires_at,contact_email")
    .eq("verification_token_hash", membershipTokenHash(token)).maybeSingle();
  if (!application || application.status !== "email_verification_pending"
    || new Date(application.verification_expires_at) <= new Date()) {
    redirect("/membership?application=link-invalid");
  }
  const { data: plan } = await admin.from("membership_plans")
    .select("requires_approval").eq("id", application.requested_plan_id).maybeSingle();
  if (!plan) redirect("/membership?application=link-invalid");
  const status = plan.requires_approval
    ? "awaiting_approval"
    : application.payment_method === "stripe" ? "awaiting_payment" : "awaiting_cash";
  const { error } = await admin.from("membership_applications").update({
    status, email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", application.id).eq("status", "email_verification_pending");
  if (error) redirect("/membership?application=link-invalid");
  await admin.from("membership_notifications").insert({
    application_id: application.id,
    kind: status === "awaiting_approval" ? "membership.application-approval-required"
      : status === "awaiting_cash" ? "membership.application-cash-instructions" : "membership.application-payment-link",
    title: status === "awaiting_approval" ? "Your membership application is awaiting review"
      : status === "awaiting_cash" ? "Your membership application is ready for cash payment" : "Continue your membership payment",
    body: status === "awaiting_approval"
      ? "Your verified application was received. A membership officer will review the eligibility details before payment."
      : status === "awaiting_cash"
        ? "Your verified application is ready. Arrange the complete cash fee with a membership officer; partial payments are not accepted."
        : "Your verified application is ready for secure Stripe Checkout. Membership starts only after Stripe confirms full payment.",
    action_href: status === "awaiting_payment" ? `/membership/checkout?token=${encodeURIComponent(token)}` : null,
    portal_visible: false,
    deduplication_key: `application-verified-${application.id}`,
    recipient_email: application.contact_email,
  });
  if (status === "awaiting_payment") redirect(await createApplicationCheckout(application.id));
  redirect(`/membership?application=${status === "awaiting_approval" ? "awaiting-approval" : "awaiting-cash"}`);
}
