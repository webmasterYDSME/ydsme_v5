import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, PoundSterling } from "lucide-react";
import {
  assignMemberPortalLogin,
  correctMemberEligibility,
  removeMemberPortalLogin,
  reportOfflineMembershipPaymentFailure,
  requestMemberContactChange,
} from "@/lib/actions/membership";
import { requireCapability } from "@/lib/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { newsletterConsentSources } from "@/lib/membership-admin/officer-member";
import { dateLabel, memberStateName, money, paymentMethodName } from "@/lib/membership-admin/format";
import { loadMemberRecord } from "@/lib/membership-admin/records";
import { MemberHonoraryPanel } from "../../_components/MemberHonoraryPanel";
import { MemberPaymentPanel } from "../../_components/MemberPaymentPanel";
import { MembershipFlash } from "../../_components/MembershipFlash";
import styles from "../../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

/** Whether the member gets the newsletter and, for officer-recorded consent, how and when it was given. */
function newsletterLabel(member: { newsletter_opt_in?: boolean | null; newsletter_consent_source?: string | null; newsletter_consent_given_on?: string | null }) {
  if (!member.newsletter_opt_in) return "Not subscribed";
  const how = member.newsletter_consent_source ? newsletterConsentSources[member.newsletter_consent_source as keyof typeof newsletterConsentSources] : null;
  return how && member.newsletter_consent_given_on ? `Subscribed · ${how}, ${dateLabel(member.newsletter_consent_given_on)}` : "Subscribed · agreed on the website application";
}

const stateClass = (state: string) => state === "active" ? styles.pillOk : state === "honorary" ? styles.pillRequest
  : ["grace", "payment_review"].includes(state) ? styles.pillPayment : styles.pillMute;

export default async function MembershipRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!uuid.test(id)) notFound();
  await requireCapability("memberships.manage");
  const record = await loadMemberRecord(id);
  if (!record) notFound();
  const { member, plan, plans, terms, honorary, payments, choices, renewable, currentYear } = record;

  const base = `/admin/memberships/members/${id}`;
  const initials = String(member.full_name).split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("");
  const paidTerms = terms.filter((term) => term.status === "paid");
  const paidUntil = paidTerms.reduce<string | null>((latest, term) => (!latest || term.ends_on > latest ? term.ends_on : latest), null);
  const openHonorary = honorary.find((item) => ["scheduled", "active"].includes(item.status) && !item.revoked_effective_on) ?? null;
  const anyHonorary = honorary.some((item) => ["scheduled", "active"].includes(item.status));
  const panel = one(query.panel);
  const honoraryPanel = panel === "honorary" && !anyHonorary ? "grant" : panel === "end-honorary" && openHonorary ? "end" : null;
  const requestedYear = Number(one(query.year));
  const defaultYear = choices.find((choice) => choice.membership_year === currentYear)?.amount_pence === null ? currentYear + 1 : currentYear;
  const year = requestedYear === currentYear || requestedYear === currentYear + 1 ? requestedYear : defaultYear;
  const actor = (payment: { administrative_actors?: unknown }) => (Array.isArray(payment.administrative_actors) ? payment.administrative_actors[0] : payment.administrative_actors) as { display_name: string; reference_code: string } | null;

  return <>
    <MembershipFlash query={query}/>
    <Link className={styles.backLink} href="/admin/memberships/members"><ArrowLeft aria-hidden="true"/>Back to members</Link>
    <section className={styles.profile}>
      <span className={styles.avatar} aria-hidden="true">{initials}</span>
      <div className={styles.profileMain}>
        <p className="eyebrow dark">Membership record</p>
        <h2>{member.full_name}</h2>
        <div className={styles.profileMeta}>
          <span className={`${styles.pill} ${stateClass(member.effective_state)}`}>{memberStateName(member.effective_state)}</span>
          {plan ? <span className={`${styles.pill} ${styles.pillMute}`}>{plan.name}</span> : null}
          {member.effective_state === "honorary" ? <span className={`${styles.pill} ${styles.pillMute}`}>Lifetime</span> : paidUntil ? <span className={`${styles.pill} ${styles.pillMute}`}>Paid to {dateLabel(paidUntil)}</span> : null}
        </div>
      </div>
      <div className={styles.profileActions}>
        <Link className="button dark" href={`${base}?panel=payment&year=${year}`} prefetch={false} scroll={false}><PoundSterling/>Record payment</Link>
        {!anyHonorary ? <Link className="button outline" href={`${base}?panel=honorary`} prefetch={false} scroll={false}>Make honorary</Link> : null}
        {openHonorary ? <Link className="button outline" href={`${base}?panel=end-honorary`} prefetch={false} scroll={false}>End honorary</Link> : null}
      </div>
    </section>

    <div className={styles.recordGrid}>
      <section className={styles.card} id="member-history">
        <h2>Membership and payments</h2>
        <p className={styles.lead}>Every membership year, what was due, and how it was paid.</p>
        <div className={styles.termList}>
          {terms.map((term) => <div className={styles.term} key={term.id}>
            <div className={styles.termHead}><strong>{term.membership_year} · {memberStateName(term.status)}</strong><span className={`${styles.pill} ${term.status === "paid" ? styles.pillOk : styles.pillMute}`}>{term.amount_paid_pence === term.amount_due_pence ? money(term.amount_paid_pence) : `${money(term.amount_paid_pence)} paid of ${money(term.amount_due_pence)}`}</span></div>
            <small>{dateLabel(term.starts_on)} to {dateLabel(term.ends_on)}</small>
            {payments.filter((payment) => payment.term_id === term.id).map((payment) => {
              const by = actor(payment);
              return <div key={payment.id}>
                <p>{paymentMethodName(payment.method)} · {payment.status.replaceAll("_", " ")} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}{payment.offline_reference ? ` · reference ${payment.offline_reference}` : ""}{by ? ` · recorded by ${by.display_name} (${by.reference_code})` : ""}</p>
                {payment.method !== "stripe" && payment.status === "paid" ? <details className={styles.technical}><summary>Report a returned or reversed payment</summary><form action={reportOfflineMembershipPaymentFailure} className="stack-form"><input type="hidden" name="payment_id" value={payment.id}/><label>What happened?<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Saving…">Send payment for checking</PendingSubmitButton></form></details> : null}
              </div>;
            })}
          </div>)}
          {honorary.map((item) => <div className={styles.term} key={item.id}>
            <div className={styles.termHead}><strong>Lifetime honorary · {item.status}</strong></div>
            <small>Starts {dateLabel(item.effective_from)}{item.revoked_effective_on ? ` · changes ${dateLabel(item.revoked_effective_on)}` : ""}</small>
            <p>{item.reason}{item.revocation_reason ? ` · ${item.revocation_reason}` : ""}</p>
          </div>)}
          {!terms.length && !honorary.length ? <div className="membership-empty-state"><CreditCard/><strong>No history yet</strong><p>No membership or payment history has been recorded.</p></div> : null}
        </div>
      </section>

      <div className={styles.stack}>
        <section className={styles.card}>
          <h2>Contact</h2>
          <dl className={`${styles.facts} ${styles.cardGap}`}>
            <div><dt>Email</dt><dd>{member.contact_email || "None"}</dd></div>
            {member.contact_email ? <div><dt>Confirmed</dt><dd>{member.contact_email_verified_at ? "Yes" : "Not yet"}</dd></div> : null}
            <div><dt>Newsletter</dt><dd>{newsletterLabel(member)}</dd></div>
            <div><dt>Whose address</dt><dd>{member.contact_role === "guardian" ? "Guardian correspondence" : member.contact_role === "shared_household" ? "Shared household" : "The member’s own"}</dd></div>
            {member.contact_number ? <div><dt>Telephone</dt><dd>{member.contact_number}</dd></div> : null}
          </dl>
          <details className={`${styles.technical} ${styles.cardGap}`}><summary>Change correspondence details</summary>
            <form action={requestMemberContactChange} className="editor-form"><input type="hidden" name="member_id" value={id}/><p className="form-help">A changed email address is used only after the mailbox confirms it. Shared addresses are allowed.</p><label>Email address <em>Leave empty to remove</em><input type="email" name="contact_email" defaultValue={member.contact_email || ""}/></label><label>Whose address is this?<select name="contact_role" defaultValue={member.contact_role || "self"}><option value="self">The member’s own</option><option value="guardian">Guardian correspondence</option><option value="shared_household">Shared household correspondence</option></select></label><label>Reason for the change<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Sending confirmation…">Save and verify correspondence</PendingSubmitButton></form>
          </details>
        </section>

        <section className={styles.card}>
          <h2>Personal details</h2>
          <dl className={`${styles.facts} ${styles.cardGap}`}><div><dt>Date of birth</dt><dd>{member.date_of_birth ? dateLabel(member.date_of_birth) : "Not recorded"}</dd></div></dl>
          <details className={`${styles.technical} ${styles.cardGap}`}><summary>Correct the date of birth</summary>
            <form action={correctMemberEligibility} className="editor-form"><input type="hidden" name="member_id" value={id}/><p className="form-help">Use this only when the saved date is wrong. The reason is kept in the member’s history.</p><label>Date of birth<input type="date" name="date_of_birth" defaultValue={member.date_of_birth || ""} required/></label><label>Reason for the change<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save corrected date</PendingSubmitButton></form>
          </details>
        </section>

        <section className={styles.card}>
          <h2>Website login</h2>
          <p className={styles.lead}>{member.auth_user_id ? "This member has a personal website login." : "This member has no personal website login."} A shared contact address never gives one person access to another person’s membership; each member with website access needs a unique login email.</p>
          <details className={`${styles.technical} ${styles.cardGap}`}><summary>{member.auth_user_id ? "Remove personal website access" : "Assign or invite a website login"}</summary>
            {member.auth_user_id
              ? <form action={removeMemberPortalLogin} className="stack-form"><input type="hidden" name="member_id" value={id}/><label>Reason for removing access<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Removing…">Remove personal website access</PendingSubmitButton></form>
              : <form action={assignMemberPortalLogin} className="stack-form"><input type="hidden" name="member_id" value={id}/><label>Unique login email<input type="email" name="login_email" required/></label><label>Reason for assigning this login<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Assigning…">Assign or invite website login</PendingSubmitButton></form>}
          </details>
        </section>
      </div>
    </div>

    {honoraryPanel ? <MemberHonoraryPanel mode={honoraryPanel} memberId={id} name={member.full_name} planName={plan?.name ?? null} honorary={openHonorary ? { id: openHonorary.id, effective_from: openHonorary.effective_from } : null} plans={plans} closeHref={base}/> : null}
    {panel === "payment" ? <MemberPaymentPanel memberId={id} name={member.full_name} planName={plan?.name ?? null} renewable={renewable} choices={choices} currentYear={currentYear} year={year}
      closeHref={base} yearHref={(option) => `${base}?panel=payment&year=${option}`}/> : null}
  </>;
}
