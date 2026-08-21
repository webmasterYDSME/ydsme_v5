"use client";

import { useState } from "react";
import { CalendarDays, CirclePoundSterling } from "lucide-react";
import {
  defaultMembershipPlan,
  eligibleMembershipPlans,
  membershipBillingYear,
  proratedMembershipFee,
} from "@/lib/membership-rules";

type OfficerPlan = {
  id: string;
  slug: string;
  name: string;
  minimum_age: number;
  maximum_age: number;
};

type OfficerPrice = {
  plan_id: string;
  membership_year: number;
  amount_pence: number;
};

const money = (pence: number) => new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
}).format(pence / 100);

export function OfficerMembershipEligibilityFields({ plans, prices, today }: {
  plans: OfficerPlan[];
  prices: OfficerPrice[];
  today: string;
}) {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [student, setStudent] = useState(false);
  const eligibility = dateOfBirth
    ? eligibleMembershipPlans(plans, dateOfBirth, new Date(`${startDate}T00:00:00Z`)) : null;
  const adult = eligibility?.plans.find((plan) => plan.slug === "adult") ?? null;
  const studentPlan = eligibility?.plans.find((plan) => plan.slug === "student") ?? null;
  const selected = student && studentPlan ? studentPlan : defaultMembershipPlan(eligibility?.plans ?? []);
  const chargeDate = new Date(`${startDate || today}T00:00:00Z`);
  const billingYear = membershipBillingYear(chargeDate);
  const selectedPrice = selected
    ? prices.find((price) => price.plan_id === selected.id && price.membership_year === billingYear)
    : null;
  const amountDue = selectedPrice ? proratedMembershipFee(selectedPrice.amount_pence, chargeDate) : null;
  const monthsIncluded = chargeDate.getUTCMonth() === 11 ? 12 : 12 - chargeDate.getUTCMonth();

  return <div className="wide officer-eligibility-fields">
    <div className="membership-manual-date-grid">
      <label>Date of birth<input type="date" name="date_of_birth" max={today} required value={dateOfBirth} onInput={(event) => {
        const value = event.currentTarget.value;
        setDateOfBirth(value);
        setStudent(false);
        const matches = eligibleMembershipPlans(plans, value, new Date(`${startDate}T00:00:00Z`));
        event.currentTarget.setCustomValidity(defaultMembershipPlan(matches.plans) ? "" : "No membership is available for this age.");
      }}/></label>
      <label>Membership start date<input type="date" name="received_on" required value={startDate} onInput={(event) => {
        setStartDate(event.currentTarget.value);
        setStudent(false);
      }}/><small>This is also the payment date when payment has already been received.</small></label>
    </div>
    {selected ? <input type="hidden" name="plan_id" value={selected.id}/> : null}
    {adult && studentPlan ? <label className="checkbox-row membership-student-choice"><input type="checkbox" name="student_declaration" checked={student} onChange={(event) => setStudent(event.target.checked)}/>Use Student membership instead; I have confirmed that the person is eligible</label> : null}
    <div className={`membership-manual-charge ${dateOfBirth && !selected ? "has-error" : ""}`} aria-live="polite">
      <span className="membership-manual-charge-icon">{selected ? <CirclePoundSterling/> : <CalendarDays/>}</span>
      {selected ? <div>
        <span>Membership and amount to collect</span>
        <strong>{selected.name}</strong>
        {selectedPrice && amountDue !== null ? <>
          <b>{money(amountDue)}</b>
          <small>{chargeDate.getUTCMonth() === 11
            ? `Full ${billingYear} fee. The remaining days in December are included at no extra charge.`
            : `${monthsIncluded} months through 31 December ${billingYear}, reduced from the ${money(selectedPrice.amount_pence)} annual fee.`}</small>
        </> : <small>No price has been set for {billingYear}. Set the annual fee before adding this member.</small>}
      </div> : <div>
        <span>Membership and amount to collect</span>
        <strong>{dateOfBirth ? "No matching membership" : "Enter the date of birth"}</strong>
        <small>{dateOfBirth ? "Check the date or the age limits below." : "The membership type and reduced fee are calculated automatically."}</small>
      </div>}
    </div>
  </div>;
}
