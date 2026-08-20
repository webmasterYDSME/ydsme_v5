import { ArrowRight, Check, KeyRound, ShieldCheck, Wrench } from "lucide-react";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { submitMembershipApplication } from "@/lib/actions/membership";
import { membershipBillingEnabled } from "@/lib/features";
import { getPublicMembershipPlans, proratedMembershipFee, type PublicMembershipPlan } from "@/lib/membership";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Membership & How to Join",
  description: "Join York Model Engineers for member running days, workshops, shared facilities and a welcoming community of traditional and modern makers.",
  path: "/membership",
  keywords: ["join model engineering club", "York Model Engineers membership", "model railway club York"],
});

const applicationMessages: Record<string, string> = {
  received: "Check your email for a secure verification link. For privacy, this message is the same for new and existing records.",
  "awaiting-approval": "Your email is verified. A membership officer will review your application and contact you.",
  "awaiting-cash": "Your email is verified. A membership officer will confirm your membership when the full cash fee is received.",
  "payment-received": "Stripe is processing your payment. Membership and portal access are activated only after the verified payment webhook arrives.",
  "payment-cancelled": "No payment was taken. You can use the secure link in your email when you are ready.",
  "link-invalid": "That application link is invalid or has expired. Submit a new application to continue.",
  "payment-link-invalid": "That payment link is invalid or has expired. Contact the Society for a replacement.",
  eligibility: "The selected plan does not match the eligibility details supplied.",
  invalid: "Check the application details and try again.",
  "security-check": "The security check was not completed. Please try again.",
  unavailable: "Online membership applications are not currently open.",
};

function pounds(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(pence / 100);
}

const planOrder = new Map([["adult", 0], ["concession", 1], ["student", 2], ["junior", 3]]);

export default async function Membership({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const query = await searchParams;
  const enabled = membershipBillingEnabled();
  const plans = enabled ? (await getPublicMembershipPlans()).sort((a, b) => (planOrder.get(a.slug) ?? 9) - (planOrder.get(b.slug) ?? 9)) : [];
  const year = plans[0]?.membership_year ?? new Date().getFullYear();
  const message = query.application ? applicationMessages[query.application] : null;

  return <PageShell>
    <InnerHero kicker="Become a member" title={<>Don’t just watch.<br/><em>Make it move.</em></>} copy="Join a generous community of makers, drivers, fixers and lifelong learners—with nearly five acres to explore." image="/images/engine.webp" imageAlt="A live-steam locomotive at York Model Engineers" imageTone="bright"/>
    <section className="section membership-lead"><div><p className="eyebrow dark">Your workshop gets bigger</p><h2>Tools, tracks<br/>& <em>good company.</em></h2></div><div><p>Membership opens up member-only running days, workshops, events and the collective knowledge of people who love solving practical problems.</p><ul><li><Check/>Member-only events and running days</li><li><Check/>Learn from experienced model engineers</li><li><Check/>Use and help shape our unique facilities</li><li><Check/>A welcoming home for traditional and modern making</li></ul></div></section>
    {plans.length ? <section className="tier-grid">{plans.map((plan, index) => <Reveal key={plan.id} delay={index * .05}><article className={plan.slug === "adult" ? "tier featured" : "tier"}><div className="tier-top"><span>0{index + 1}</span><Wrench/></div><p>{plan.name}</p><h3>{pounds(plan.amount_pence)}<small>/ year</small></h3><p>{plan.description}</p>{plan.requires_approval ? <b>OFFICER APPROVAL</b> : <b>MOST POPULAR</b>}</article></Reveal>)}</section> : null}
    <section className="join-panel"><div><KeyRound/><p className="eyebrow">Membership year ends 31 December {year}</p><h2>Ready to come<br/><em>aboard?</em></h2><p>Applications, secure online payments, cash membership and renewals are now managed directly by the Society.</p></div><a className="button brass large" href="#membership-application">Apply to join <ArrowRight/></a></section>
    <section id="membership-application" className="section membership-application-section">
      <div><p className="eyebrow dark">Secure application</p><h2>Start your<br/><em>membership.</em></h2><p>We verify your email before taking payment. Discounted and junior applications are reviewed before payment, and portal access starts only after payment or honorary activation.</p><div className="security-strip"><ShieldCheck/><div><strong>Payment details stay with Stripe</strong><span>The Society does not store card or bank credentials.</span></div></div></div>
      <div className="portal-card membership-application-card">
        {message ? <p className={`form-message ${query.application?.includes("invalid") || ["eligibility", "security-check", "unavailable"].includes(query.application || "") ? "error" : "success"}`} role="status">{message}</p> : null}
        {enabled && plans.length ? <form action={submitMembershipApplication} className="editor-form membership-application-form">
          <label>Membership plan<select name="plan_id" required>{plans.map((plan: PublicMembershipPlan) => <option key={plan.id} value={plan.id}>{plan.name} — {pounds(plan.amount_pence)} per year</option>)}</select></label>
          <div className="form-grid"><label>Title<input name="title" maxLength={30}/></label><label>Full name<input name="full_name" autoComplete="name" required/></label></div>
          <div className="form-grid"><label>Email address<input name="contact_email" type="email" autoComplete="email" required/></label><label>Contact number<input name="contact_number" type="tel" autoComplete="tel"/></label></div>
          <label>Date of birth<input name="date_of_birth" type="date" autoComplete="bday" required/><small>Used only to confirm the selected age band.</small></label>
          <label className="checkbox-row"><input name="student_declaration" type="checkbox"/>I am currently a student (required for Student membership)</label>
          <fieldset><legend>Junior applications</legend><p>Applicants aged 14–17 must provide guardian contact and consent.</p><div className="form-grid"><label>Guardian name<input name="guardian_name" autoComplete="name"/></label><label>Guardian email<input name="guardian_email" type="email" autoComplete="email"/></label></div><label className="checkbox-row"><input name="guardian_consent" type="checkbox"/>The named guardian consents to this application</label></fieldset>
          <fieldset><legend>Payment</legend><label className="checkbox-row"><input name="payment_method" type="radio" value="stripe" defaultChecked/>Secure online payment through Stripe</label><label className="checkbox-row"><input name="payment_method" type="radio" value="cash"/>Cash paid to a membership officer</label><label className="checkbox-row"><input name="auto_renew" type="checkbox" defaultChecked/>Automatically renew online membership each 1 January</label><p>Auto-renewal is on by default and can be switched off before checkout or later in your account. Switching it off never shortens a paid term. Cash never renews automatically.</p></fieldset>
          <div className="membership-charge-disclosure"><strong>Exact online charges today</strong>{plans.map((plan) => <p key={plan.id}>{plan.name}: {pounds(proratedMembershipFee(plan.amount_pence))} first charge, then {pounds(plan.amount_pence)} on 1 January {plan.membership_year + 1} and annually while auto-renew remains on.</p>)}{new Date().getUTCMonth() === 11 ? <p>December access starts immediately; the remaining December days are included free with the following full membership year.</p> : null}</div>
          <label className="checkbox-row"><input name="terms" type="checkbox" required/>I accept the membership terms, eligibility review, calendar-year renewal dates and the Society’s privacy policy.</label>
          <CaptchaField/>
          <PendingSubmitButton className="button dark" pendingLabel="Submitting securely…">Verify and continue <ArrowRight/></PendingSubmitButton>
        </form> : <p>Online applications are being prepared. Please contact <a href="mailto:secretary@yorkmodelengineers.co.uk">the Society secretary</a> in the meantime.</p>}
      </div>
    </section>
  </PageShell>;
}
