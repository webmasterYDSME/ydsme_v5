import { getCurrentUser, getRole, hasCapability, isMembershipOfficer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const admin = createAdminClient();
  const [role, { data: profile }] = await Promise.all([
    getRole(user.id),
    admin.from("users").select("membership_status").eq("id", user.id).maybeSingle(),
  ]);
  const authorised = profile?.membership_status === "active"
    && (hasCapability(role, "donations.view") || await isMembershipOfficer(user.id, role));
  if (!authorised) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const campaign = ["generic", "target"].includes(params.get("campaign") || "") ? params.get("campaign")! : null;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "") ? params.get("from") : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") || "") ? params.get("to") : null;
  let query = admin.from("donation_payments").select("paid_at,campaign,amount_pence,refunded_pence,currency,payment_status,stripe_checkout_session_id,stripe_payment_intent_id,stripe_event_id");
  if (campaign) query = query.eq("campaign", campaign);
  if (from) query = query.gte("paid_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lt("paid_at", `${to}T23:59:59.999Z`);
  const { data, error } = await query.order("paid_at", { ascending: false }).limit(50_000);
  if (error) return new Response("Export unavailable", { status: 500 });
  const rows = [["Paid at", "Campaign", "Gross GBP", "Refunds GBP", "Net GBP", "Status", "Checkout Session", "PaymentIntent", "Last Stripe event"], ...(data ?? []).map((item) => [item.paid_at, item.campaign, (item.amount_pence / 100).toFixed(2), (item.refunded_pence / 100).toFixed(2), ((item.amount_pence - item.refunded_pence) / 100).toFixed(2), item.payment_status, item.stripe_checkout_session_id, item.stripe_payment_intent_id, item.stripe_event_id])];
  return new Response(rows.map((row) => row.map(csv).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="donations-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
