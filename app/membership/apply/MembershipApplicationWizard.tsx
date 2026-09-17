"use client";

import { membershipPhonePattern, membershipPhoneHint } from "@/lib/membership-phone";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { EmailVerification, type EmailVerificationHandle } from "./EmailVerification";
import { saveSignupDraft } from "@/lib/actions/membership-signup";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import {
  MembershipEligibilityFields,
  type EligibilityPlan,
} from "@/app/membership/apply/MembershipEligibilityFields";
import { submitMembershipApplication } from "@/lib/actions/membership";

type WizardPlan = EligibilityPlan & { membership_year: number };

const stages = [
  { label: "Membership", help: "Date of birth and eligibility" },
  { label: "About you", help: "Contact details" },
  { label: "Review", help: "Check details and consent" },
  { label: "Payment", help: "Choose how you would like to pay" },
];

function pounds(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

export function MembershipApplicationWizard({
  plans,
  today,
  bankTransferAvailable,
  initialDraft = {},
  initiallyVerified = false,
}: {
  initialDraft?: Record<string, string>;
  initiallyVerified?: boolean;
  plans: WizardPlan[];
  today: string;
  bankTransferAvailable: boolean;
}) {
  const [contactEmail, setContactEmail] = useState(initialDraft.contact_email || "");
  const [guardianEmail, setGuardianEmail] = useState(initialDraft.guardian_email || "");
  const [applicantName, setApplicantName] = useState(initialDraft.full_name || "");
  const [emailVerified, setEmailVerified] = useState(initiallyVerified);
  const [identityVersion, setIdentityVersion] = useState(0);
  const [stage, setStage] = useState(0);
  const [guardianLed, setGuardianLed] = useState(initialDraft.guardian_led === "on");
  const verificationRef = useRef<EmailVerificationHandle>(null);
  const [continuing, setContinuing] = useState(false);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    sectionRefs.current[stage]?.querySelector<HTMLElement>("h2")?.focus();
  }, [stage]);

  function currentStageIsValid() {
    const section = sectionRefs.current[stage];
    if (!section) return false;
    const controls = Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    ));
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  async function continueToNextStage() {
    if (continuing || !currentStageIsValid()) return;
    const form = sectionRefs.current[stage]?.closest("form");
    if (!form) return;
    setContinuing(true);
    try {
      if (stage === 1 && !emailVerified) {
        const canContinue = await verificationRef.current?.verify(form);
        if (!canContinue) {
          const verification = sectionRefs.current[stage]?.querySelector(".membership-email-verification");
          const bounds = verification?.getBoundingClientRect();
          if (verification && bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
            verification.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          return;
        }
      }
      if (emailVerified) void saveSignupDraft(new FormData(form));
      setStage((current) => Math.min(current + 1, stages.length - 1));
    } finally {
      setContinuing(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (stage === stages.length - 1) return;
    event.preventDefault();
    continueToNextStage();
  }

  return <div className="membership-application-wizard">
    <nav className="membership-wizard-progress" aria-label="Application progress">
      <ol>{stages.map((item, index) => <li key={item.label} className={index < stage ? "is-complete" : index === stage ? "is-current" : ""} aria-current={index === stage ? "step" : undefined}>
        <span>{index < stage ? "✓" : index + 1}</span>
        <div><strong>{item.label}</strong><small>{item.help}</small></div>
      </li>)}</ol>
      <p aria-live="polite">Step {stage + 1} of {stages.length}</p>
    </nav>

    <form onBlur={event => { if (emailVerified) void saveSignupDraft(new FormData(event.currentTarget)); }} onChange={event => { const target = event.target as unknown as HTMLInputElement; if (target.name === "contact_email") setContactEmail(target.value); if (target.name === "guardian_email") setGuardianEmail(target.value); if (["contact_email","guardian_email","full_name","date_of_birth","guardian_led"].includes(target.name)) { setEmailVerified(false); setIdentityVersion(value => value + 1); } }} action={submitMembershipApplication} autoComplete="on" className="membership-application-form membership-wizard-form" onSubmit={handleFormSubmit}>
      <section ref={(node) => { sectionRefs.current[0] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 0}>
        <header><span>01</span><div><p className="eyebrow dark">Your membership</p><h2 tabIndex={-1}>We’ll find the right plan.</h2></div></header>
        <MembershipEligibilityFields initialDraft={initialDraft} plans={plans} today={today} onGuardianLedChange={setGuardianLed}/>
      </section>

      <section ref={(node) => { sectionRefs.current[1] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 1}>
        <header><span>02</span><div><p className="eyebrow dark">{guardianLed ? "Junior and guardian" : "About you"}</p><h2 tabIndex={-1}>{guardianLed ? "Tell us who’s joining." : "How can we reach you?"}</h2></div></header>
        {guardianLed ? <fieldset className="membership-junior-fields">
          <legend>Junior applicant and guardian</legend>
          <div className="membership-guardian-names">
            <label>Junior member’s full name<input name="full_name" maxLength={180} minLength={2} value={applicantName} onChange={event => setApplicantName(event.target.value)} type="text" autoComplete="name" required/></label>
            <label>Guardian full name<input name="guardian_name" maxLength={180} defaultValue={initialDraft.guardian_name} type="text" autoComplete="name" required/></label>
          </div>
          <EmailVerification ref={verificationRef} emailAddress={guardianEmail} emailField={<label>Guardian email<input name="guardian_email" maxLength={254} defaultValue={initialDraft.guardian_email} type="email" autoComplete="email" required/><small>We’ll send a six-digit code to this email address.</small></label>} initiallyVerified={initiallyVerified && identityVersion === 0} identityVersion={identityVersion} onVerified={setEmailVerified}/>
          <input name="guardian_led" type="hidden" value="on"/>
          <label className="membership-check-card"><input name="guardian_consent" type="checkbox" required/><span><strong>Guardian consent</strong>I am this Junior’s parent or guardian, and I consent to their Society membership.</span></label>
        </fieldset> : <>
          <div className="membership-field-grid compact"><label><span className="membership-field-label">Title <em>Optional</em></span><input name="title" defaultValue={initialDraft.title} type="text" list="membership-title-options" maxLength={10} autoComplete="honorific-prefix"/><datalist id="membership-title-options"><option value="Mr"/><option value="Mrs"/><option value="Miss"/><option value="Ms"/><option value="Mx"/><option value="Dr"/><option value="Prof"/><option value="Rev"/></datalist></label><label>Full name<input name="full_name" maxLength={180} minLength={2} value={applicantName} onChange={event => setApplicantName(event.target.value)} type="text" autoComplete="name" required/></label></div>
          <div className="membership-field-grid"><label>Email address<input name="contact_email" maxLength={254} defaultValue={initialDraft.contact_email} type="email" autoComplete="email" required/><small>We’ll send a six-digit code to this email address.</small></label><label><span className="membership-field-label">Contact number <em>Optional</em></span><input name="contact_number" defaultValue={initialDraft.contact_number} type="tel" autoComplete="tel" pattern={membershipPhonePattern} title={membershipPhoneHint} maxLength={40}/></label></div>
          <EmailVerification ref={verificationRef} emailAddress={contactEmail} initiallyVerified={initiallyVerified && identityVersion === 0} identityVersion={identityVersion} onVerified={setEmailVerified}/>
        </>}
      </section>

      <section ref={(node) => { sectionRefs.current[2] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 2}>
        <header><span>03</span><div><p className="eyebrow dark">Review and consent</p><h2 tabIndex={-1}>Check and confirm.</h2></div></header>
        <div className="membership-review-note"><ShieldCheck/><div><strong>You can still go back</strong><p>Review the details you entered, then confirm the membership terms before choosing how to pay.</p></div></div>
        <div className="membership-before-submit">
          <h3>Before you continue</h3>
          <ul>
            <li><strong>Club Rules</strong><span>A copy is available on request and in the website’s member area after activation.</span></li>
            <li><strong>Membership identification</strong><span>You’ll receive a membership card and lanyard, which should be worn while on Society premises.</span></li>
            <li><strong>Keeping you informed</strong><span>The Society uses the email address provided for essential membership messages.</span></li>
          </ul>
        </div>
        <label className="membership-terms-choice"><input name="terms" type="checkbox" required/><span>I agree to follow the Club Rules and accept the membership terms, eligibility review, calendar-year renewal dates and the Society’s <Link href="/privacy-policy">privacy policy</Link>.</span></label>
        <label className="membership-terms-choice"><input name="newsletter_opt_in" type="checkbox"/><span>I would like to receive the Society newsletter. This is optional and separate from essential membership messages.</span></label>
      </section>

      <section ref={(node) => { sectionRefs.current[3] = node; }} className="membership-form-section membership-form-finish membership-wizard-stage" hidden={stage !== 3}>
        <header><span>04</span><div><p className="eyebrow dark">Payment</p><h2 tabIndex={-1}>Choose how you’d like to pay.</h2></div></header>
        <fieldset className="membership-payment-picker">
          <legend>Payment method</legend>
          <div>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="stripe" defaultChecked={!initialDraft.payment_method || initialDraft.payment_method === "stripe"}/><CreditCard/><span><strong>Pay securely online</strong>Continue to Stripe’s secure payment page.</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="cash" defaultChecked={initialDraft.payment_method === "cash"}/><WalletCards/><span><strong>Pay in cash</strong>An officer will confirm the complete payment.</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="bank_transfer" defaultChecked={initialDraft.payment_method === "bank_transfer"} disabled={!bankTransferAvailable}/><WalletCards/><span><strong>Bank transfer</strong>{bankTransferAvailable ? "Receive the Society bank details after submitting your verified application." : "Temporarily unavailable while payment details are being configured."}</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="cheque" defaultChecked={initialDraft.payment_method === "cheque"}/><WalletCards/><span><strong>Pay by cheque</strong>Receive payee and delivery instructions after submitting your application.</span></label>
          </div>
        </fieldset>
        <div className="membership-online-payment-options">
          <div className="membership-charge-disclosure"><span>What you’ll pay</span>{plans.map((plan) => <p data-plan={plan.slug} key={plan.id}><span>{plan.name}</span><b>{pounds(plan.today_amount_pence)} today</b><small>One-time payment. We will invite you when annual renewals open.</small></p>)}{new Date().getUTCMonth() === 11 ? <p className="membership-december-charge"><span>December applications</span><small>The remaining December days are included free with the following full membership year.</small></p> : null}</div>
        </div>
        <div className="membership-submit-row"><div><ShieldCheck/><span><strong>Verified application</strong>Your verified details will be saved when you continue.</span></div><PendingSubmitButton className="button dark" pendingLabel="Saving application…">Submit application <ArrowRight/></PendingSubmitButton></div>
      </section>

      <div className="membership-wizard-actions">
        {stage > 0 ? <button className="membership-wizard-back" type="button" onClick={() => setStage((current) => current - 1)}><ArrowLeft/> Back</button> : <span/>}
        {stage < stages.length - 1 ? <button className="button dark membership-wizard-next" type="button" disabled={continuing} onClick={continueToNextStage}>{continuing ? "Checking…" : "Continue"} <ArrowRight/></button> : null}
      </div>
    </form>
  </div>;
}
