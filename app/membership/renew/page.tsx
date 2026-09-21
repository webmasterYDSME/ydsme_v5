import type { ReactNode } from "react";
import { CircleCheck, Clock, CreditCard, ShieldAlert, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { membershipTokenHash, ensureMembershipPlanPrice } from "@/lib/membership";
import { returningMemberFee } from "@/lib/membership-rules";
import { payRenewalInvitation } from "@/lib/actions/membership-renewals";
import { membershipBillingEnabled } from "@/lib/features";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PageShell } from "@/app/components/PageShell";
import confirmation from "../confirmation.module.css";
import styles from "./renew.module.css";

export const dynamic = "force-dynamic";

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

/** One card in the shared confirmation style, for every state of the page. */
function Card({ icon, title, children, done }: { icon: ReactNode; title: string; children: ReactNode; done?: boolean }) {
  return <PageShell headerTheme="light"><div className={confirmation.page}><section className={`${confirmation.card} ${done ? styles.done : ""}`} aria-labelledby="renew-title">
    <div className={`${confirmation.icon} ${done ? styles.doneIcon : ""}`} aria-hidden="true">{icon}</div>
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
  if (!invitation) return <Card icon={<Clock/>} title="This renewal link has expired"><p>Renewal links stop working when the renewal period ends. Please contact the membership officer, who can send you a new link.</p></Card>;
  const { data: campaign } = await admin.from("membership_renewal_campaigns").select("open").eq("membership_year", invitation.membership_year).single();
  const { data: member } = await admin.from("members").select("full_name,contact_email,current_plan_id,effective_state").eq("id", invitation.member_id).single();
  if (!member || !campaign?.open || ["suspended", "archived", "honorary", "payment_review"].includes(member.effective_state)) {
    return <Card icon={<ShieldAlert/>} title="Renewal is not available"><p>Renewal cannot be paid online for this membership at the moment. Please contact the membership officer.</p></Card>;
  }
  const { data: term } = await admin.from("membership_terms").select("status,amount_paid_pence,membership_plan_prices(membership_plans(name))").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).maybeSingle();
  if (term?.status === "paid") {
    const year = invitation.membership_year;
    const paidPlan = (term as { membership_plan_prices?: { membership_plans?: { name?: string } | null } | null }).membership_plan_prices?.membership_plans?.name;
    return <Card done icon={<CircleCheck/>} title={`Thank you, ${member.full_name.trim().split(/\s+/)[0]}.`}>
      <p className={styles.lead}>Your membership renewal for the year {year} is successful.</p>
      <dl className={styles.summary}>
        <div><dt>Member</dt><dd>{member.full_name}</dd></div>
        {paidPlan ? <div><dt>Membership</dt><dd>{paidPlan}</dd></div> : null}
        <div><dt>Covers</dt><dd>1 January – 31 December {year}</dd></div>
        {term.amount_paid_pence > 0 ? <div className={styles.total}><dt>Paid</dt><dd>{pounds(term.amount_paid_pence)}</dd></div> : null}
      </dl>
      <div className={confirmation.note}><ShieldCheck aria-hidden="true"/><span>There is nothing more you need to do. If any of these details look wrong, please contact the membership officer.</span></div>
    </Card>;
  }
  if ((term?.amount_paid_pence ?? 0) > 0) return <Card icon={<ShieldAlert/>} title="Your payment needs review"><p>Contact the membership officer before making another payment.</p></Card>;
  const { data: transition } = await admin.from("membership_plan_transitions").select("from_plan_id,to_plan_id,status").eq("member_id", invitation.member_id).eq("membership_year", invitation.membership_year).in("status", ["approved", "scheduled", "awaiting_student_review"]).maybeSingle();
  // A pending Student request decides the fee, so nothing can be paid until the officer has answered it.
  if (transition?.status === "awaiting_student_review") return <Card icon={<Clock/>} title="Your membership type is being reviewed"><p>Your Student membership request needs to be decided before you can renew. The membership officer will be in touch.</p></Card>;
  const price = await ensureMembershipPlanPrice(transition?.to_plan_id ?? member.current_plan_id, invitation.membership_year);
  const { data: plan } = await admin.from("membership_plans").select("name").eq("id", price.plan_id).single();
  const { data: previousPlan } = transition?.from_plan_id && transition.from_plan_id !== transition.to_plan_id
    ? await admin.from("membership_plans").select("name").eq("id", transition.from_plan_id).single() : { data: null };
  const year = invitation.membership_year;
  // A lapsed member coming back pays the part-year fee, like a new member. The amount charged is worked out again
  // when they press pay, from the same rule.
  const amountToPay = returningMemberFee({ effectiveState: member.effective_state, annualPence: price.amount_pence, membershipYear: year });
  const partYear = amountToPay < price.amount_pence;
  return <Card icon={<CreditCard/>} title="Renew your membership">
    <p>{member.full_name} · Membership for {year}</p>
    <dl className={styles.summary}>
      <div><dt>Membership</dt><dd>{plan?.name}{previousPlan ? ` (was ${previousPlan.name})` : ""}</dd></div>
      <div><dt>Runs</dt><dd>{partYear ? `From when you rejoin to 31 December ${year}` : `1 January – 31 December ${year}`}</dd></div>
      <div className={styles.total}><dt>To pay</dt><dd>{pounds(amountToPay)}</dd></div>
    </dl>
    {partYear ? <div className={confirmation.note}><Clock aria-hidden="true"/><span>Because your membership has lapsed, this is the part-year fee for the months left in {year}, the same as for a new member. The full annual fee is {pounds(price.amount_pence)}.</span></div> : null}
    <div className={confirmation.note}><ShieldCheck aria-hidden="true"/><span>One payment by card on a secure payment page. No automatic subscription or future charge is set up.</span></div>
    {query.error ? <p className={styles.alert} role="alert">Payment is unavailable or already processing. Please check your membership or contact the officer before trying again.</p> : null}
    <form className={styles.pay} action={payRenewalInvitation}>
      <input name="token" type="hidden" value={token}/>
      <PendingSubmitButton className="button dark" pendingLabel="Taking you to payment…">Pay membership renewal</PendingSubmitButton>
    </form>
    <p className={styles.other}>Would rather pay by cash, bank transfer or cheque? Please contact the membership officer.</p>
  </Card>;
}
