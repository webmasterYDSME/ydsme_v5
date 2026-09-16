"use client";

import { useState } from "react";
import { Check, GraduationCap } from "lucide-react";
import { DatePicker } from "@/app/components/DatePicker";
import { defaultMembershipPlan, eligibleMembershipPlans } from "@/lib/membership-rules";

export type EligibilityPlan = {
  id: string;
  slug: "junior" | "student" | "adult" | "concession";
  name: string;
  description: string;
  minimum_age: number;
  maximum_age: number;
  amount_pence: number;
  today_amount_pence: number;
};

function pounds(pence: number, whole = false) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: whole ? 0 : 2,
  }).format(pence / 100);
}

export function MembershipEligibilityFields({
  plans,
  today,
  guardianLed,
  onGuardianLedChange,
}: {
  plans: EligibilityPlan[];
  today: string;
  guardianLed: boolean;
  onGuardianLedChange: (value: boolean) => void;
}) {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const eligibility = dateOfBirth ? eligibleMembershipPlans(plans, dateOfBirth, todayDate) : null;
  const adultPlan = eligibility?.plans.find((plan) => plan.slug === "adult") ?? null;
  const studentPlan = eligibility?.plans.find((plan) => plan.slug === "student") ?? null;
  const hasAdultStudentChoice = Boolean(adultPlan && studentPlan);
  const selectedPlan = eligibility?.plans.find((plan) => plan.id === selectedPlanId)
    ?? (eligibility ? defaultMembershipPlan(eligibility.plans) : null);

  function updateDateOfBirth(value: string, input: HTMLInputElement) {
    setDateOfBirth(value);
    if (!value) {
      setSelectedPlanId(null);
      onGuardianLedChange(false);
      input.setCustomValidity("");
      return;
    }
    const nextEligibility = eligibleMembershipPlans(plans, value, todayDate);
    const nextPlan = defaultMembershipPlan(nextEligibility.plans);
    setSelectedPlanId(nextPlan?.id ?? null);
    if (nextPlan?.slug !== "junior") onGuardianLedChange(false);
    input.setCustomValidity(nextPlan ? "" : "Membership is available from age 14. Please check the date entered.");
  }

  return <div className="membership-eligibility-picker">
    <label className="membership-dob-field" htmlFor="membership-date-of-birth">
      <span className="membership-field-label">Date of birth</span>
      <DatePicker id="membership-date-of-birth" name="date_of_birth" value={dateOfBirth} max={today} required autoComplete="bday" className="membership-date-control" submissionFormat="display" onValueChange={(value, input) => updateDateOfBirth(value, input)}/>
    </label>

    {selectedPlan ? <>
      <input name="plan_id" type="hidden" value={selectedPlan.id}/>
      <span className="membership-plan-selection" data-plan={selectedPlan.slug} aria-hidden="true"/>
    </> : null}
    {selectedPlan?.slug === "student" ? <input name="student_declaration" type="hidden" value="on"/> : null}

    {!dateOfBirth ? <div className="membership-plan-prompt" aria-live="polite">
      <span>Enter your date of birth</span>
      <p>We’ll select the appropriate membership and show the price here.</p>
    </div> : null}

    {dateOfBirth && !selectedPlan ? <div className="membership-plan-prompt error" aria-live="polite">
      <span>Check your date of birth</span>
      <p>No available membership matches the age entered.</p>
    </div> : null}

    {selectedPlan && !hasAdultStudentChoice ? <div className="membership-plan-result" aria-live="polite">
      <Check aria-hidden="true"/>
      <div><span>Your membership</span><strong>{selectedPlan.name}</strong><p>{selectedPlan.description}</p></div>
      <div className="membership-plan-result-price"><strong>{pounds(selectedPlan.amount_pence, true)}</strong><span>per year</span><small>{pounds(selectedPlan.today_amount_pence)} today</small></div>
    </div> : null}

    {hasAdultStudentChoice && adultPlan && studentPlan ? <fieldset className="membership-overlap-options">
      <legend>Choose your membership</legend>
      <p>Adult membership is selected automatically. Choose Student only if you are currently a student.</p>
      <div>
        {[adultPlan, studentPlan].map((plan) => <label className="membership-overlap-choice" key={plan.id}>
          <input
            name="eligible_plan_choice"
            type="radio"
            value={plan.slug}
            checked={selectedPlan?.id === plan.id}
            onChange={() => setSelectedPlanId(plan.id)}
          />
          {plan.slug === "student" ? <GraduationCap aria-hidden="true"/> : <Check aria-hidden="true"/>}
          <span><strong>{plan.name}</strong><small>{plan.slug === "student" ? "I confirm that I am currently a student." : "Standard membership for your age."}</small></span>
          <b>{pounds(plan.amount_pence, true)}<small>per year</small></b>
        </label>)}
      </div>
    </fieldset> : null}

    {selectedPlan?.slug === "junior" ? <fieldset className="membership-junior-fields">
      <legend>Guardian details and consent</legend>
      <p>A guardian email is mandatory. The application cannot proceed until the guardian confirms.</p>
      <div className="membership-field-grid">
        <label>Guardian name<input name="guardian_name" type="text" autoComplete="name" required/></label>
        <label>Guardian email<input name="guardian_email" type="email" autoComplete="email" required/></label>
      </div>
      <label className="membership-check-card"><input name="guardian_led" type="checkbox" checked={guardianLed} onChange={(event) => onGuardianLedChange(event.target.checked)}/><span><strong>The Junior does not have their own email</strong>Use the guardian email for this application and membership correspondence. A personal portal account will not be created for the Junior.</span></label>
      <label className="membership-check-card"><input name="guardian_consent" type="checkbox" required/><span><strong>Permission to contact the guardian</strong>I confirm that the named guardian is expecting this consent request.</span></label>
    </fieldset> : null}
  </div>;
}
