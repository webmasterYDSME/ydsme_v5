import { createServiceClient } from "@/lib/supabase/admin";
import { membershipTokenHash, ensureMembershipPlanPrice } from "@/lib/membership";
import { payRenewalInvitation } from "@/lib/actions/membership-renewals";
import { membershipBillingEnabled } from "@/lib/features";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
export const dynamic = "force-dynamic";
export default async function Renewal({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  if (!membershipBillingEnabled()) redirect("/membership");
  const query = await searchParams;
  const token = query.token || "";
  if (token.length < 20 || token.length > 200) redirect("/membership");
  const admin = createServiceClient();
  const { data: invitation } = await admin.from("membership_renewal_invitations").select("member_id,membership_year")
    .eq("token_hash", membershipTokenHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!invitation) return <main><h1>This renewal link has expired</h1><p>Please contact the membership officer.</p></main>;
  const { data: campaign } = await admin.from("membership_renewal_campaigns").select("open").eq("membership_year", invitation.membership_year).single();
  const { data: member } = await admin.from("members").select("full_name,contact_email,current_plan_id,effective_state").eq("id", invitation.member_id).single();
  if (!member || !campaign?.open || ["suspended","archived","honorary","payment_review"].includes(member.effective_state)) return <main><h1>Renewal is not available</h1><p>Please contact the membership officer.</p></main>;
  const { data: term } = await admin.from("membership_terms").select("status,amount_paid_pence").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).maybeSingle();
  if (term?.status === "paid") return <main><h1>Your membership is already paid</h1><p>{member.full_name} · {invitation.membership_year}</p></main>;
  if ((term?.amount_paid_pence ?? 0) > 0) return <main><h1>Your payment needs review</h1><p>Contact the membership officer before making another payment.</p></main>;
  const { data: transition } = await admin.from("membership_plan_transitions").select("to_plan_id").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).in("status", ["approved","scheduled"]).maybeSingle();
  const price = await ensureMembershipPlanPrice(transition?.to_plan_id ?? member.current_plan_id, invitation.membership_year);
  const { data: plan } = await admin.from("membership_plans").select("name").eq("id",price.plan_id).single();
  return <main className="membership-apply-page"><section className="membership-completion-card"><h1>Renew your membership</h1>
    <p>{member.full_name} · Membership for {invitation.membership_year}</p><p>{plan?.name} · 1 January–31 December {invitation.membership_year}</p>
    <h2>{new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(price.amount_pence/100)}</h2>
    <p>One payment. No automatic subscription or future charge.</p>
    {query.error && <p role="alert">Payment is unavailable or already processing. Please check your membership or contact the officer before trying again.</p>}
    <form action={payRenewalInvitation}><input name="token" type="hidden" value={token}/><PendingSubmitButton className="button dark">Pay membership renewal</PendingSubmitButton></form>
  </section></main>;
}
