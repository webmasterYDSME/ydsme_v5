import { CreditCard } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import {
  openMembershipBillingPortal,
  requestStudentMembership,
  startMembershipRenewalCheckout,
  toggleMembershipAutoRenew,
} from "@/lib/actions/membership";
import type { MembershipAccount } from "@/lib/membership";
import { date, membershipStatus, money, paymentMethod, paymentStatus } from "../format";
import { Section } from "./Section";
import styles from "../account.module.css";

type Props = {
  /** Null when this login is not linked to a membership record. */
  membership: MembershipAccount | null;
  /** The year of the renewal campaign that is open now, if any. */
  campaignYear: number | null;
  renewalAvailable: boolean;
  /** An honorary member whose honorary status is scheduled to end and who will then pay a fee. */
  honoraryTransitionPayment: boolean;
};

/** Membership status, what to do about renewal, and the payment history. */
export function MembershipSection({ membership, campaignYear, renewalAvailable, honoraryTransitionPayment }: Props) {
  const honorary = membership?.member.effective_state === "honorary";
  return <Section
    id="membership"
    title={honorary ? "Lifetime honorary member" : membership?.plan?.name || "Membership"}
    description="Your membership term, renewal and payment history.">
    <div className={styles.stack}>
      {membership ? <>
        <Facts membership={membership}/>
        <StudentRequest membership={membership}/>
        <Renewal membership={membership} campaignYear={campaignYear} renewalAvailable={renewalAvailable} honoraryTransitionPayment={honoraryTransitionPayment}/>
        <History membership={membership}/>
      </> : <p className={styles.empty}>Your account has not yet been linked to the Society’s membership register. A membership officer can complete this for you.</p>}
    </div>
  </Section>;
}

function Facts({ membership }: { membership: MembershipAccount }) {
  const { term, honorary } = membership;
  return <dl className={styles.facts}>
    <div className={styles.fact}><dt>Status</dt><dd>{membershipStatus(membership.member.effective_state)}</dd></div>
    <div className={styles.fact}><dt>Member since</dt><dd>{date(membership.member.joined_on)}</dd></div>
    {term ? <>
      <div className={styles.fact}><dt>Current membership</dt><dd>{term.membership_year} · {membershipStatus(term.status)}</dd></div>
      <div className={styles.fact}><dt>Paid</dt><dd>{money(term.amount_paid_pence)}</dd></div>
      <div className={styles.fact}><dt>Membership ends</dt><dd>{date(term.ends_on)}</dd></div>
      <div className={styles.fact}><dt>Final renewal date</dt><dd>{date(term.grace_ends_on)}</dd></div>
    </> : null}
    {honorary ? <div className={styles.fact}><dt>Honorary membership</dt><dd>{membershipStatus(honorary.status)} from {date(honorary.effective_from)}</dd></div> : null}
  </dl>;
}

function StudentRequest({ membership }: { membership: MembershipAccount }) {
  if (membership.student_request.available) {
    return <form action={requestStudentMembership} className={styles.panel}>
      <div>
        <strong>Student membership for {membership.student_request.membership_year}</strong>
        <p>Members aged 18–24 may request the Student fee during November. Adult remains the default until an officer approves the request, and payment waits for that decision.</p>
      </div>
      <PendingSubmitButton className="button outline" pendingLabel="Sending request…">Request Student membership</PendingSubmitButton>
    </form>;
  }
  if (membership.student_request.status === "awaiting_student_review") {
    return <p className={`${styles.panel} ${styles.panelInfo}`}>The Student membership request is awaiting an officer decision. Renewal payment is paused so the wrong fee is not charged.</p>;
  }
  return null;
}

function Renewal({ membership, campaignYear, renewalAvailable, honoraryTransitionPayment }: Omit<Props, "membership"> & { membership: MembershipAccount }) {
  const subscription = membership.subscription;
  if (subscription && !["canceled", "incomplete_expired"].includes(subscription.status)) {
    const state = subscription.renewal_locked ? "Off — an offline payment already covers the forthcoming term."
      : subscription.cancel_at_period_end ? "Off — your current paid term is unchanged."
        : `On${subscription.next_charge_at ? ` — ${subscription.renewal_amount_pence !== null ? `${money(subscription.renewal_amount_pence)} on ` : "next charge "}${new Date(subscription.next_charge_at).toLocaleDateString("en-GB")}` : ""}.`;
    return <div className={styles.panel}>
      <div><strong>Automatic renewal</strong><p>{state}</p></div>
      <div className={styles.panelActions}>
        {!subscription.renewal_locked ? <form action={toggleMembershipAutoRenew}>
          <input type="hidden" name="enable" value={subscription.cancel_at_period_end ? "true" : "false"}/>
          <PendingSubmitButton className="button outline" pendingLabel="Updating…">{subscription.cancel_at_period_end ? "Turn on auto-renew" : "Turn off auto-renew"}</PendingSubmitButton>
        </form> : null}
        <form action={openMembershipBillingPortal}>
          <PendingSubmitButton className="button outline" pendingLabel="Opening secure payment settings…"><CreditCard/>Update payment method</PendingSubmitButton>
        </form>
      </div>
    </div>;
  }
  if (membership.member.effective_state === "honorary" && !honoraryTransitionPayment) {
    return <p className={`${styles.panel} ${styles.panelInfo}`}>Honorary membership has no fee, expiry or renewal.</p>;
  }
  if (renewalAvailable || honoraryTransitionPayment) {
    const changeDate = membership.honorary?.revoked_effective_on;
    return <form action={startMembershipRenewalCheckout} className={styles.panel}>
      <div>
        <strong>{honoraryTransitionPayment && changeDate ? `Prepare membership from ${date(changeDate)}` : `Renew ${campaignYear} membership securely online`}</strong>
        <p>{honoraryTransitionPayment ? "Honorary access continues until the scheduled change date. The payment page will show the exact replacement fee before payment." : "Pay the full annual fee once. No automatic renewal payment will be taken."}</p>
      </div>
      <PendingSubmitButton className="button dark" pendingLabel="Opening secure payment…"><CreditCard/>Continue to payment</PendingSubmitButton>
    </form>;
  }
  return <div className={`${styles.panel} ${styles.panelInfo}`}>
    <div>
      <strong>Membership paid</strong>
      <p>Your {membership.term?.membership_year} membership is paid through {membership.term ? date(membership.term.ends_on) : "31 December"}. We will invite you when the membership officer opens annual renewals.</p>
    </div>
  </div>;
}

function History({ membership }: { membership: MembershipAccount }) {
  if (!membership.history.length && !membership.honorary_history.length) return null;
  return <details className={styles.history}>
    <summary>Membership and payment history</summary>
    <div className={styles.historyList}>
      {membership.history.map((term) => <article key={term.id} className={styles.historyItem}>
        <strong>{term.membership_year} · {membershipStatus(term.status)}</strong>
        <p>{money(term.amount_paid_pence)}{term.amount_paid_pence !== term.amount_due_pence ? ` of ${money(term.amount_due_pence)}` : ""}</p>
        {term.payments.map((payment) => <small key={payment.id}>{paymentMethod(payment.method)} · {paymentStatus(payment.status)} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}</small>)}
      </article>)}
      {membership.honorary_history.map((item) => <article key={item.id} className={styles.historyItem}>
        <strong>Lifetime honorary · {membershipStatus(item.status)}</strong>
        <p>Starts {date(item.effective_from)}{item.revoked_effective_on ? ` · changes ${date(item.revoked_effective_on)}` : ""}</p>
      </article>)}
    </div>
  </details>;
}
