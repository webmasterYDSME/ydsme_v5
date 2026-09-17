import Link from "next/link";
import { CalendarDays, CircleCheck, RotateCcw, ShieldCheck, UserRoundCheck, WalletCards } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/admin";
import { openRenewalCampaign, reviewPaidMembership } from "@/lib/actions/membership-renewals";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export async function MembershipLaunchOperations({ payments }: { payments: boolean }) {
  const admin = createServiceClient();
  if (payments) {
    const year = new Date().getUTCFullYear();
    const { data: plans, error } = await admin.from("membership_plans").select("id,name,membership_plan_prices(membership_year,amount_pence,version,active)").eq("active",true).order("sort_order");
    if (error) throw new Error("Unable to load renewal fees.");
    return <section className="membership-launch-panel membership-renewal-launch"><header><span className="membership-launch-icon"><WalletCards/></span><div><p className="eyebrow dark">Annual renewal</p><h2>Open annual renewals</h2><p>Check the annual fees before sending invitations. Paid and honorary members are excluded automatically.</p></div></header>
    <div className="membership-renewal-fees"><table><caption>Annual membership fees</caption><thead><tr><th>Membership</th><th>{year}</th><th>{year+1}</th></tr></thead><tbody>{(plans ?? []).map(plan => <tr key={plan.id}><th>{plan.name}</th>{[year,year+1].map(feeYear => {
      const price = plan.membership_plan_prices.filter(price => price.active && price.membership_year <= feeYear).sort((a,b) => b.membership_year-a.membership_year || b.version-a.version)[0];
      return <td key={feeYear}>{price ? money.format(price.amount_pence/100) : "Not configured"}</td>;
    })}</tr>)}</tbody></table></div>
    <form action={openRenewalCampaign} className="editor-form membership-renewal-launch-form"><label>Membership year<select name="membership_year"><option>{new Date().getUTCFullYear()+1}</option><option>{new Date().getUTCFullYear()}</option></select></label>
    <PendingSubmitButton>Open renewals and send invitations</PendingSubmitButton></form></section>;
  }
  const { data } = await admin.from("membership_applications").select("id,full_name,guardian_name,guardian_email,guardian_contact_number,guardian_consent_version,guardian_verified_at,date_of_birth").eq("status","converted").eq("manual_verification","pending");
  const { data: denied } = await admin.from("membership_applications").select("id,full_name,converted_member_id,review_reason").eq("manual_verification", "denied");
  const refunds = [];
  for (const application of denied ?? []) {
    const { data: terms } = await admin.from("membership_terms").select("membership_payments(amount_pence,refunded_pence)").eq("application_id", application.id);
    const outstanding = (terms ?? []).flatMap(term => term.membership_payments).reduce((sum, payment) => sum + payment.amount_pence - payment.refunded_pence, 0);
    if (outstanding > 0) refunds.push({ ...application, outstanding });
  }
  return <section className="membership-launch-panel membership-verification-workspace"><header><span className="membership-launch-icon"><ShieldCheck/></span><div><p className="eyebrow dark">Paid and active</p><h2>Memberships awaiting verification</h2><p>Confirm eligibility and Junior guardian consent. Membership remains active unless the application is denied.</p></div><span className="membership-launch-count">{data?.length ?? 0}<small>to review</small></span></header>
    <div className="membership-verification-queue">{(data ?? []).map(application => <article className="membership-verification-card" key={application.id}><header><span><UserRoundCheck/></span><div><h3>{application.full_name}</h3><p><CircleCheck/> Active member · verification pending</p></div></header>
      <dl><div><dt><CalendarDays/>Date of birth</dt><dd>{date(application.date_of_birth)}</dd></div>{application.guardian_name ? <div><dt>Guardian</dt><dd>{application.guardian_name}</dd><small>{[application.guardian_email, application.guardian_contact_number].filter(Boolean).join(" · ")}</small></div> : null}{application.guardian_consent_version ? <div><dt>Guardian consent</dt><dd>Declaration {application.guardian_consent_version}</dd><small>{application.guardian_verified_at ? `Email verified ${new Date(application.guardian_verified_at).toLocaleDateString("en-GB")}` : "Email verification pending"}</small></div> : null}</dl>
      <form action={reviewPaidMembership} className="editor-form membership-verification-form"><input type="hidden" name="application_id" value={application.id}/><label>Decision<select name="decision"><option value="approved">Confirm membership</option><option value="denied">Deny membership — arrange refund manually</option></select></label><label>Reason<textarea name="reason" minLength={5} maxLength={500} placeholder="Record what was checked and any supporting details." required/></label><PendingSubmitButton>Record verification</PendingSubmitButton></form></article>)}
      {!data?.length ? <div className="membership-empty-state"><CircleCheck/><strong>Verification queue complete</strong><p>No paid memberships need checking.</p></div> : null}</div>
    {refunds.length > 0 && <section className="membership-refund-queue"><header><RotateCcw/><div><p className="eyebrow dark">Follow-up required</p><h2>Manual refunds to arrange</h2></div></header>{refunds.map(application => <article key={application.id}><div><h3>{application.full_name}</h3><p>{application.review_reason}</p><strong>{money.format(application.outstanding / 100)} to refund</strong></div><Link className="button outline" href={`/admin/memberships?member=${application.converted_member_id}&section=member-history#member-history`}>View payment</Link></article>)}</section>}
  </section>;
}
