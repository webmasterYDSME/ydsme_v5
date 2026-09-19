import type { ReactNode } from "react";
import { CircleCheck, Clock, CreditCard, ShieldAlert, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { membershipTokenHash, ensureMembershipPlanPrice } from "@/lib/membership";
import { payRenewalInvitation } from "@/lib/actions/membership-renewals";
import { membershipBillingEnabled } from "@/lib/features";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PageShell } from "@/app/components/PageShell";
import confirmation from "../confirmation.module.css";
import styles from "./renew.module.css";

export const dynamic = "force-dynamic";

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

/** One card in the shared confirmation style, for every state of the page. */
function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <PageShell headerTheme="light"><div className={confirmation.page}><section className={confirmation.card} aria-labelledby="renew-title">
    <div className={confirmation.icon} aria-hidden="true">{icon}</div>
    <p className="eyebrow dark">Membership renewal</p>
    <h1 id="renew-title">{title}</h1>
    {children}
  </section></div></PageShell>;
}

export default async function Renewal({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  if (!membershipBillingEnabled()) redirect("/membership");
  const query = await searchParams;
  const token = query.token || "";
  if (token.length < 20 || token.length > 200) redirect("/membership");
  const admin = createServiceClient();
  const { data: invitation } = await admin.from("membership_renewal_invitations").select("member_id,membership_year")
    .eq("token_hash", membershipTokenHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!invitation) return <Card icon={<Clock/>} title="This renewal link has expired"><p>Please contact the membership officer, who can send you a new one.</p></Card>;
  const { data: campaign } = await admin.from("membership_renewal_campaigns").select("open").eq("membership_year", invitation.membership_year).single();
  const { data: member } = await admin.from("members").select("full_name,contact_email,current_plan_id,effective_state").eq("id", invitation.member_id).single();
  if (!member || !campaign?.open || ["suspended", "archived", "honorary", "payment_review"].includes(member.effective_state)) {
    return <Card icon={<ShieldAlert/>} title="Renewal is not available"><p>Renewal cannot be paid online for this membership at the moment. Please contact the membership officer.</p></Card>;
  }
  const { data: term } = await admin.from("membership_terms").select("status,amount_paid_pence").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).maybeSingle();
  if (term?.status === "paid") return <Card icon={<CircleCheck/>} title="Your membership is already paid"><p>{member.full_name} · {invitation.membership_year}</p><p>There is nothing more to do. Thank you.</p></Card>;
  if ((term?.amount_paid_pence ?? 0) > 0) return <Card icon={<ShieldAlert/>} title="Your payment needs review"><p>Contact the membership officer before making another payment.</p></Card>;
  const { data: transition } = await admin.from("membership_plan_transitions").select("from_plan_id,to_plan_id,status").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).in("status", ["approved", "scheduled", "awaiting_student_review"]).maybeSingle();
  // A pending Student request decides the fee, so nothing can be paid until the officer has answered it.
  if (transition?.status === "awaiting_student_review") return <Card icon={<Clock/>} title="Your membership type is being reviewed"><p>Your Student membership request needs to be decided before you can renew. The membership officer will be in touch.</p></Card>;
  const price = await ensureMembershipPlanPrice(transition?.to_plan_id ?? member.current_plan_id, invitation.membership_year);
  const { data: plan } = await admin.from("membership_plans").select("name").eq("id", price.plan_id).single();
  const { data: previousPlan } = transition?.from_plan_id && transition.from_plan_id !== transition.to_plan_id
    ? await admin.from("membership_plans").select("name").eq("id", transition.from_plan_id).single() : { data: null };
  const year = invitation.membership_year;
  return <Card icon={<CreditCard/>} title="Renew your membership">
    <p>{member.full_name} · Membership for {year}</p>
    <dl className={styles.summary}>
      <div><dt>Membership</dt><dd>{plan?.name}{previousPlan ? ` (was ${previousPlan.name})` : ""}</dd></div>
      <div><dt>Runs</dt><dd>1 January – 31 December {year}</dd></div>
      <div className={styles.total}><dt>To pay</dt><dd>{pounds(price.amount_pence)}</dd></div>
    </dl>
    <div className={confirmation.note}><ShieldCheck aria-hidden="true"/><span>One payment by card on a secure payment page. No automatic subscription or future charge is set up.</span></div>
    {query.error ? <p className={styles.alert} role="alert">Payment is unavailable or already processing. Please check your membership or contact the officer before trying again.</p> : null}
    <form className={styles.pay} action={payRenewalInvitation}>
      <input name="token" type="hidden" value={token}/>
      <PendingSubmitButton className="button dark" pendingLabel="Taking you to payment…">Pay membership renewal</PendingSubmitButton>
    </form>
    <p className={styles.other}>Would rather pay by cash, bank transfer or cheque? Please contact the membership officer.</p>
  </Card>;
}
