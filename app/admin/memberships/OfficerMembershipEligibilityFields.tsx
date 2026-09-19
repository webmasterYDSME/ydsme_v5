"use client";

import { useState } from "react";
import { CalendarDays, CirclePoundSterling } from "lucide-react";
import { DatePicker } from "@/app/components/DatePicker";
import { ageOn, dateLabel } from "@/lib/membership-admin/format";
import {
  defaultMembershipPlan,
  eligibleMembershipPlans,
  membershipBillingYear,
  proratedMembershipFee,
} from "@/lib/membership-rules";
import styles from "./memberships.module.css";

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

/**
 * What the officer has entered so far (date of birth, start date, student choice) and what follows
 * from it: the membership type and the amount to collect. The date fields and the fee summary are
 * separate components so the form can place the fee beside the payment.
 */
export function useOfficerEligibility({ plans, prices, today, initial }: {
  plans: OfficerPlan[];
  prices: OfficerPrice[];
  today: string;
  /** Values to start from, so a form that came back with an error keeps what was typed. */
  initial?: { dateOfBirth?: string; startDate?: string; student?: boolean };
}) {
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate || today);
  const [student, setStudent] = useState(initial?.student ?? false);
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
  return {
    today, plans, dateOfBirth, setDateOfBirth, startDate, setStartDate, student, setStudent,
    adult, studentPlan, selected, selectedPrice, amountDue, chargeDate, billingYear, monthsIncluded,
    age: ageOn(dateOfBirth, startDate || today),
  };
}

export type OfficerEligibility = ReturnType<typeof useOfficerEligibility>;

/** Date of birth, the start date (today unless changed) and the student choice. */
export function OfficerMembershipEligibilityFields({ eligibility: e }: { eligibility: OfficerEligibility }) {
  const { plans, today } = e;
  return <div className="wide officer-eligibility-fields">
    <label htmlFor="officer-date-of-birth">Date of birth<DatePicker id="officer-date-of-birth" name="date_of_birth" max={today} required value={e.dateOfBirth} onInput={(value, input) => {
      e.setDateOfBirth(value);
      e.setStudent(false);
      const matches = eligibleMembershipPlans(plans, value, new Date(`${e.startDate}T00:00:00Z`));
      input.setCustomValidity(defaultMembershipPlan(matches.plans) ? "" : "No membership is available for this age.");
    }}/></label>
    <details className={styles.disclosure}>
      <summary>Membership starts {dateLabel(e.startDate) || "today"}</summary>
      <label htmlFor="officer-membership-start-date">Membership start date<DatePicker id="officer-membership-start-date" name="received_on" required max={today} value={e.startDate} onValueChange={(value) => {
        e.setStartDate(value);
        e.setStudent(false);
      }}/><small>This is also the payment date when payment has already been received.</small></label>
    </details>
    {e.selected ? <input type="hidden" name="plan_id" value={e.selected.id}/> : null}
    {e.adult && e.studentPlan ? <label className="checkbox-row membership-student-choice"><input type="checkbox" name="student_declaration" checked={e.student} onChange={(event) => e.setStudent(event.target.checked)}/>Use Student membership instead; I have confirmed that the person is eligible</label> : null}
  </div>;
}

/** The membership type and amount to collect, worked out from the date of birth and start date. */
export function OfficerFeeSummary({ eligibility: e }: { eligibility: OfficerEligibility }) {
  const { selected, selectedPrice, amountDue, chargeDate, billingYear, monthsIncluded, dateOfBirth } = e;
  return <div className={`membership-manual-charge ${dateOfBirth && !selected ? "has-error" : ""}`} aria-live="polite">
    <span className="membership-manual-charge-icon">{selected ? <CirclePoundSterling/> : <CalendarDays/>}</span>
    {selected ? <div>
      <span>Membership and amount to collect</span>
      <strong>{selected.name}{e.age !== null ? ` · ${e.age}yo` : ""}</strong>
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
  </div>;
}
