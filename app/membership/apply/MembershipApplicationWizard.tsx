"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { CaptchaField } from "@/app/components/CaptchaField";
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
  { label: "Payment", help: "How you would like to pay" },
  { label: "Review", help: "Consent and secure submission" },
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
}: {
  plans: WizardPlan[];
  today: string;
  bankTransferAvailable: boolean;
}) {
  const [stage, setStage] = useState(0);
  const [guardianLed, setGuardianLed] = useState(false);
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

  function continueToNextStage() {
    if (!currentStageIsValid()) return;
    setStage((current) => Math.min(current + 1, stages.length - 1));
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

    <form action={submitMembershipApplication} autoComplete="on" className="membership-application-form membership-wizard-form" onSubmit={handleFormSubmit}>
      <section ref={(node) => { sectionRefs.current[0] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 0}>
        <header><span>01</span><div><p className="eyebrow dark">Your membership</p><h2 tabIndex={-1}>We’ll find the right plan.</h2></div></header>
        <MembershipEligibilityFields plans={plans} today={today} guardianLed={guardianLed} onGuardianLedChange={setGuardianLed}/>
      </section>

      <section ref={(node) => { sectionRefs.current[1] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 1}>
        <header><span>02</span><div><p className="eyebrow dark">About you</p><h2 tabIndex={-1}>How can we reach you?</h2></div></header>
        <div className="membership-field-grid compact"><label><span className="membership-field-label">Title <em>Optional</em></span><input name="title" type="text" list="membership-title-options" maxLength={10} autoComplete="honorific-prefix"/><datalist id="membership-title-options"><option value="Mr"/><option value="Mrs"/><option value="Miss"/><option value="Ms"/><option value="Mx"/><option value="Dr"/><option value="Prof"/><option value="Rev"/></datalist></label><label>Full name<input name="full_name" type="text" autoComplete="name" required/></label></div>
        <div className="membership-field-grid"><label>Email address<input name="contact_email" type="email" autoComplete="email" required={!guardianLed} disabled={guardianLed}/><small>{guardianLed ? "The guardian email will be used for this application." : "We’ll send your verification link here."}</small></label><label><span className="membership-field-label">Contact number <em>Optional</em></span><input name="contact_number" type="tel" autoComplete="tel"/></label></div>
        {!guardianLed ? <label className="membership-check-card"><input name="shared_contact" type="checkbox"/><span><strong>This email is shared with another member</strong>Each membership remains separate. A different email will be needed for each personal portal account.</span></label> : null}
      </section>

      <section ref={(node) => { sectionRefs.current[2] = node; }} className="membership-form-section membership-wizard-stage" hidden={stage !== 2}>
        <header><span>03</span><div><p className="eyebrow dark">Payment</p><h2 tabIndex={-1}>Choose what suits you.</h2></div></header>
        <fieldset className="membership-payment-picker">
          <legend>Payment method</legend>
          <div>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="stripe" defaultChecked/><CreditCard/><span><strong>Pay securely online</strong>Continue to our secure payment page after verification.</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="cash"/><WalletCards/><span><strong>Pay in cash</strong>An officer will confirm the complete payment.</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="bank_transfer" disabled={!bankTransferAvailable}/><WalletCards/><span><strong>Bank transfer</strong>{bankTransferAvailable ? "Receive the Society bank details after verification and any approval." : "Temporarily unavailable while payment details are being configured."}</span></label>
            <label className="membership-payment-choice"><input name="payment_method" type="radio" value="cheque"/><WalletCards/><span><strong>Pay by cheque</strong>Receive payee and delivery instructions after verification and any approval.</span></label>
          </div>
        </fieldset>
        <div className="membership-online-payment-options">
          <label className="membership-renew-choice"><input name="auto_renew" type="checkbox" defaultChecked/><span><strong>Renew automatically each 1 January</strong>On by default for online payments. You can switch it off before checkout or later in your account.</span></label>
          <div className="membership-charge-disclosure"><span>What you’ll pay</span>{plans.map((plan) => <p data-plan={plan.slug} key={plan.id}><span>{plan.name}</span><b>{pounds(plan.today_amount_pence)} today</b><small>Then {pounds(plan.amount_pence)} on 1 January {plan.membership_year + 1} if automatic renewal stays on.</small></p>)}{new Date().getUTCMonth() === 11 ? <p className="membership-december-charge"><span>December applications</span><small>The remaining December days are included free with the following full membership year.</small></p> : null}</div>
        </div>
      </section>

      <section ref={(node) => { sectionRefs.current[3] = node; }} className="membership-form-section membership-form-finish membership-wizard-stage" hidden={stage !== 3}>
        <header><span>04</span><div><p className="eyebrow dark">Ready to apply</p><h2 tabIndex={-1}>Review and send.</h2></div></header>
        <div className="membership-review-note"><ShieldCheck/><div><strong>You can still go back</strong><p>Check the previous steps if anything needs changing. No payment is taken when this form is sent.</p></div></div>
        <div className="membership-before-submit">
          <h3>Before you submit</h3>
          <ul>
            <li><strong>Club Rules</strong><span>A copy is available on request and in the website’s member area after activation.</span></li>
            <li><strong>Membership identification</strong><span>You’ll receive a membership card and lanyard, which should be worn while on Society premises.</span></li>
            <li><strong>Keeping you informed</strong><span>The Society uses the email address provided for regular newsletters and important announcements.</span></li>
          </ul>
        </div>
        <label className="membership-terms-choice"><input name="terms" type="checkbox" required/><span>I agree to follow the Club Rules and accept the membership terms, eligibility review, calendar-year renewal dates and the Society’s <Link href="/privacy-policy">privacy policy</Link>.</span></label>
        <label className="membership-terms-choice"><input name="newsletter_opt_in" type="checkbox"/><span>I would like to receive the Society newsletter. This is optional and separate from essential membership messages.</span></label>
        <CaptchaField/>
        <div className="membership-submit-row"><div><ShieldCheck/><span><strong>Secure submission</strong>No payment is taken until your email is verified.</span></div><PendingSubmitButton className="button dark" pendingLabel="Submitting securely…">Verify and continue <ArrowRight/></PendingSubmitButton></div>
      </section>

      <div className="membership-wizard-actions">
        {stage > 0 ? <button className="membership-wizard-back" type="button" onClick={() => setStage((current) => current - 1)}><ArrowLeft/> Back</button> : <span/>}
        {stage < stages.length - 1 ? <button className="button dark membership-wizard-next" type="button" onClick={continueToNextStage}>Continue <ArrowRight/></button> : null}
      </div>
    </form>
  </div>;
}
