"use client";

import { useMemo, useState } from "react";
import { CirclePoundSterling } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { confirmExistingMemberOfflineRenewal } from "@/lib/actions/membership";

type RenewalMember = {
  id: string;
  full_name: string;
  state_label: string;
};

type RenewalChoice = {
  member_id: string;
  membership_year: number;
  amount_pence: number | null;
  note: string;
};

const money = (pence: number) => new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
}).format(pence / 100);

export function OfficerRenewalPaymentForm({
  members,
  choices,
  currentYear,
  today,
}: {
  members: RenewalMember[];
  choices: RenewalChoice[];
  currentYear: number;
  today: string;
}) {
  const firstMemberId = members[0]?.id ?? "";
  const firstCurrentChoice = choices.find((choice) => choice.member_id === firstMemberId
    && choice.membership_year === currentYear);
  const [memberId, setMemberId] = useState(firstMemberId);
  const [year, setYear] = useState(firstCurrentChoice?.amount_pence === null ? currentYear + 1 : currentYear);
  const selectedChoice = useMemo(() => choices.find((choice) => choice.member_id === memberId
    && choice.membership_year === year) ?? null, [choices, memberId, year]);
  const canRecord = selectedChoice?.amount_pence !== null && selectedChoice?.amount_pence !== undefined;

  return <form action={confirmExistingMemberOfflineRenewal} className="editor-form membership-cash-renewal-form">
    <label>Member<select name="member_id" required value={memberId} onChange={(event) => {
      const nextMemberId = event.target.value;
      setMemberId(nextMemberId);
      const currentChoice = choices.find((choice) => choice.member_id === nextMemberId
        && choice.membership_year === currentYear);
      setYear(currentChoice?.amount_pence === null ? currentYear + 1 : currentYear);
    }}>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.state_label}</option>)}</select></label>
    <label>Membership year<select name="membership_year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
      <option value={currentYear}>{currentYear}</option>
      <option value={currentYear + 1}>{currentYear + 1}</option>
    </select></label>
    <label>Payment method<select name="payment_method"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label>
    <label>Receipt or payment reference<input name="payment_reference" minLength={2} maxLength={120} required/></label>
    <label>Date received<input type="date" name="received_on" max={today} defaultValue={today} required/></label>
    <label className="checkbox-row"><input type="checkbox" name="cleared"/>Cheque cleared <em>Cheque payments only</em></label>
    <div className={`membership-renewal-charge ${canRecord ? "" : "is-unavailable"}`} aria-live="polite">
      <CirclePoundSterling aria-hidden="true"/>
      <div><span>Amount to record</span><strong>{canRecord ? money(selectedChoice.amount_pence!) : "No payment due"}</strong><small>{selectedChoice?.note ?? "Choose a member and membership year."}</small></div>
    </div>
    <PendingSubmitButton disabled={!canRecord} pendingLabel="Saving payment…">Record renewal payment</PendingSubmitButton>
  </form>;
}
