import { redirect } from "next/navigation";
import { createApplicationCheckout, ensureMembershipPlanPrice, MembershipCheckoutUnavailableError, membershipBillingYear, membershipTokenHash, proratedMembershipFee } from "@/lib/membership";
import { getMembershipPaymentSettings, offlinePaymentInstructions, offlinePaymentReminder } from "@/lib/membership-settings";
import { createServiceClient } from "@/lib/supabase/admin";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await membershipBillingEnabled())) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.length < 20 || token.length > 200) redirect("/membership/apply?application=link-invalid");
  const admin = createServiceClient();
  const { data: application } = await admin.from("membership_applications")
    .select("id,status,payment_method,requested_plan_id,verification_expires_at,expires_at,contact_email,full_name,guardian_email,guardian_led,payment_settings_version_id,created_at")
    .eq("verification_token_hash", membershipTokenHash(token)).maybeSingle();
  if (!application || application.status !== "email_verification_pending"
    || new Date(application.verification_expires_at) <= new Date()) {
    redirect("/membership/apply?application=link-invalid");
  }
  const { data: plan } = await admin.from("membership_plans")
    .select("requires_approval").eq("id", application.requested_plan_id).maybeSingle();
  if (!plan) redirect("/membership/apply?application=link-invalid");
  const guardianToken = application.guardian_email && !application.guardian_led
    ? crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "") : null;
  const status = application.guardian_email && !application.guardian_led ? "guardian_verification_pending"
    : plan.requires_approval ? "awaiting_approval"
      : application.payment_method === "stripe" ? "awaiting_payment"
        : application.payment_method === "bank_transfer" ? "awaiting_bank_transfer"
          : application.payment_method === "cheque" ? "awaiting_cheque" : "awaiting_cash";
  const { error } = await admin.from("membership_applications").update({
    status, email_verified_at: new Date().toISOString(),
    guardian_verified_at: application.guardian_led ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    guardian_verification_token_hash: guardianToken ? membershipTokenHash(guardianToken) : null,
    guardian_verification_expires_at: guardianToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
  }).eq("id", application.id).eq("status", "email_verification_pending");
  if (error) redirect("/membership/apply?application=link-invalid");
  if (guardianToken && application.guardian_email) {
    await admin.from("membership_notifications").insert({
      application_id: application.id,
      recipient_email: application.guardian_email,
      kind: "membership.guardian-verification",
      title: `Confirm ${application.full_name}'s Junior membership application`,
      body: `${application.full_name || "A junior applicant"} named you as their guardian. Confirm that you consent to this membership application.`,
      action_href: `/membership/guardian-consent?token=${encodeURIComponent(guardianToken)}`,
      portal_visible: false,
      deduplication_key: `guardian-verification-${application.id}`,
    });
    redirect("/membership/apply?application=guardian-verification");
  }
  const settings = application.payment_method === "stripe" ? null
    : await getMembershipPaymentSettings(application.payment_settings_version_id);
  const pricingDate = new Date(application.created_at);
  const price = application.payment_method === "stripe"
    ? null
    : await ensureMembershipPlanPrice(application.requested_plan_id, membershipBillingYear(pricingDate)).catch(() => null);
  if (application.payment_method !== "stripe" && !price) redirect("/membership/apply?application=payment-unavailable");
  const instructions = settings && application.payment_method !== "stripe"
    ? offlinePaymentInstructions(application.payment_method, settings, {
      applicantName: application.full_name,
      amountPence: proratedMembershipFee(price!.amount_pence, pricingDate),
    }) : null;
  let checkoutUrl: string | null = null;
  let checkoutUnavailable = false;
  if (status === "awaiting_payment") {
    try {
      checkoutUrl = await createApplicationCheckout(application.id, `/membership/checkout?token=${encodeURIComponent(token)}`);
    } catch (checkoutError) {
      if (checkoutError instanceof MembershipCheckoutUnavailableError) checkoutUnavailable = true;
      else throw checkoutError;
    }
  }
  if (checkoutUnavailable) redirect("/membership/apply?application=payment-unavailable");
  // The verification result is already shown in the browser. Send only an
  // actionable instruction, or a delayed recovery link if Checkout is left
  // unfinished. Approval decisions send their own actionable email later.
  if (status === "awaiting_payment") {
    await admin.from("membership_notifications").insert({
      application_id: application.id,
      kind: "membership.application-payment-reminder",
      title: `Finish ${application.full_name}'s membership payment`,
      body: `${application.full_name}'s verified application is saved. Continue to secure online payment when you are ready; membership starts only after the complete payment is confirmed.`,
      action_href: `/membership/checkout?token=${encodeURIComponent(token)}`,
      portal_visible: false,
      scheduled_for: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      deduplication_key: `application-payment-reminder-${application.id}`,
      recipient_email: application.contact_email,
    });
  } else if (status !== "awaiting_approval") {
    await admin.from("membership_notifications").insert([
      {
        application_id: application.id,
        kind: `membership.application-${application.payment_method}-instructions`,
        title: application.payment_method === "bank_transfer" ? "Your membership bank transfer details"
          : application.payment_method === "cheque" ? "Your membership cheque payment details"
            : "Your membership cash payment details",
        body: instructions,
        portal_visible: false,
        scheduled_for: new Date().toISOString(),
        deduplication_key: `application-payment-instructions-${application.id}`,
        recipient_email: application.contact_email,
      },
      {
        application_id: application.id,
        kind: "membership.application-payment-reminder",
        title: `Reminder: complete ${application.full_name}’s Society membership payment`,
        body: offlinePaymentReminder(application.payment_method, settings!, {
          applicantName: application.full_name,
          amountPence: proratedMembershipFee(price!.amount_pence, pricingDate),
          applicationExpiresAt: new Date(application.expires_at),
        }),
        portal_visible: false,
        scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        deduplication_key: `application-payment-reminder-${application.id}`,
        recipient_email: application.contact_email,
      },
    ]);
  }
  if (checkoutUrl) redirect(checkoutUrl);
  const resultToken = status === "awaiting_approval" ? "" : `&token=${encodeURIComponent(token)}`;
  redirect(`/membership/apply?application=${status === "awaiting_approval" ? "awaiting-approval" : status.replaceAll("_", "-")}${resultToken}`);
}
