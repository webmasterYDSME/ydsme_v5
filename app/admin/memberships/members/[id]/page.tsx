import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, PoundSterling } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { newsletterConsentLabels } from "@/lib/membership-admin/officer-member";
import { ageOn, dateLabel, londonToday, memberStateName, money, paymentMethodName, timestampDateLabel } from "@/lib/membership-admin/format";
import { loadMemberRecord } from "@/lib/membership-admin/records";
import { MemberBirthdatePanel, MemberContactPanel, MemberLoginPanel, PaymentProblemPanel } from "../../_components/MemberRecordPanels";
import { MemberHonoraryPanel } from "../../_components/MemberHonoraryPanel";
import { MemberPaymentPanel } from "../../_components/MemberPaymentPanel";
import { MembershipFlash } from "../../_components/MembershipFlash";
import styles from "../../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase("en-GB") + text.slice(1);
const invitationLabels: Record<string, string> = {
  sent: "Sent, not yet used",
  linked: "Linked to an existing login",
  blocked_shared: "Blocked: the email already has a login",
  declined: "Declined",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

/** Whether the member gets the newsletter and, for officer-recorded consent, how and when it was given. */
function newsletterLabel(member: { newsletter_opt_in?: boolean | null; newsletter_consent_source?: string | null; newsletter_consent_given_on?: string | null }) {
  if (!member.newsletter_opt_in) return "Not subscribed";
  const how = member.newsletter_consent_source ? newsletterConsentLabels[member.newsletter_consent_source as keyof typeof newsletterConsentLabels] : null;
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
  const today = londonToday();
  const age = ageOn(member.date_of_birth, today);
  const birthLabel = member.date_of_birth ? `${dateLabel(member.date_of_birth)}${age === null ? "" : ` · ${age}yo`}` : "Not recorded";
  const invitation = member.auth_user_id ? null : invitationLabels[member.portal_invitation_status ?? ""] ?? null;
  const initials = String(member.full_name).split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("");
  const paidTerms = terms.filter((term) => term.status === "paid");
  const paidUntil = paidTerms.reduce<string | null>((latest, term) => (!latest || term.ends_on > latest ? term.ends_on : latest), null);
  const openHonorary = honorary.find((item) => ["scheduled", "active"].includes(item.status) && !item.revoked_effective_on) ?? null;
  const anyHonorary = honorary.some((item) => ["scheduled", "active"].includes(item.status));
  const panel = one(query.panel);
  const problemPayment = panel === "payment-issue"
    ? payments.find((payment) => payment.id === one(query.payment) && payment.method !== "stripe" && payment.status === "paid") ?? null : null;
  const problemYear = terms.find((term) => term.id === problemPayment?.term_id)?.membership_year ?? currentYear;
  const honoraryPanel = panel === "honorary" && !anyHonorary ? "grant" : panel === "end-honorary" && openHonorary ? "end" : null;
  const requestedYear = Number(one(query.year));
  const defaultYear = choices.find((choice) => choice.membership_year === currentYear)?.amount_pence === null ? currentYear + 1 : currentYear;
  const year = requestedYear === currentYear || requestedYear === currentYear + 1 ? requestedYear : defaultYear;
  const actor = (payment: { administrative_actors?: unknown }) => (Array.isArray(payment.administrative_actors) ? payment.administrative_actors[0] : payment.administrative_actors) as { display_name: string; reference_code: string } | null;

  return <>
    <MembershipFlash/>
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
            <div className={styles.termHead}>
              <span className={styles.termTitle}><strong>{term.membership_year}</strong><span className={`${styles.pill} ${term.status === "paid" ? styles.pillOk : styles.pillMute}`}>{memberStateName(term.status)}</span></span>
              <span className={styles.termAmount}>{term.amount_paid_pence === term.amount_due_pence ? money(term.amount_paid_pence) : `${money(term.amount_paid_pence)} of ${money(term.amount_due_pence)}`}</span>
            </div>
            <small>{dateLabel(term.starts_on)} to {dateLabel(term.ends_on)}</small>
            {payments.filter((payment) => payment.term_id === term.id).map((payment) => {
              const by = actor(payment);
              const details = [
                capitalise(payment.status.replaceAll("_", " ")),
                timestampDateLabel(payment.received_at ?? payment.created_at),
                payment.offline_reference ? `reference ${payment.offline_reference}` : null,
                payment.refunded_pence ? `${money(payment.refunded_pence)} refunded` : null,
                by ? `recorded by ${by.display_name} (${by.reference_code})` : null,
              ].filter(Boolean).join(" · ");
              return <div className={styles.paymentLine} key={payment.id}>
                <div><strong>{capitalise(paymentMethodName(payment.method))} · {money(payment.amount_pence)}</strong><small>{details}</small></div>
                {payment.method !== "stripe" && payment.status === "paid"
                  ? <Link className={styles.cardLink} href={`${base}?panel=payment-issue&payment=${payment.id}`} prefetch={false} scroll={false}>Report a problem</Link> : null}
              </div>;
            })}
          </div>)}
          {honorary.map((item) => <div className={styles.term} key={item.id}>
            <div className={styles.termHead}><span className={styles.termTitle}><strong>Lifetime honorary</strong><span className={`${styles.pill} ${styles.pillRequest}`}>{capitalise(item.status)}</span></span></div>
            <small>Starts {dateLabel(item.effective_from)}{item.revoked_effective_on ? ` · changes ${dateLabel(item.revoked_effective_on)}` : ""}</small>
            <p>{item.reason}{item.revocation_reason ? ` · ${item.revocation_reason}` : ""}</p>
          </div>)}
          {!terms.length && !honorary.length ? <div className="membership-empty-state"><CreditCard/><strong>No history yet</strong><p>No membership or payment history has been recorded.</p></div> : null}
        </div>
      </section>

      <div className={styles.stack}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Contact</h2><Link className={styles.cardLink} href={`${base}?panel=contact`} prefetch={false} scroll={false}>Change</Link></div>
          <dl className={`${styles.facts} ${styles.cardGap}`}>
            <div><dt>Email</dt><dd>{member.contact_email ? `${member.contact_email}${member.contact_email_verified_at ? "" : " (not confirmed)"}` : "None"}</dd></div>
            {member.contact_role && member.contact_role !== "self" ? <div><dt>Address belongs to</dt><dd>{member.contact_role === "guardian" ? "A guardian" : "A shared household"}</dd></div> : null}
            <div><dt>Telephone</dt><dd>{member.contact_number || "None"}</dd></div>
            <div><dt>Newsletter</dt><dd>{newsletterLabel(member)}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Personal details</h2><Link className={styles.cardLink} href={`${base}?panel=dob`} prefetch={false} scroll={false}>Correct</Link></div>
          <dl className={`${styles.facts} ${styles.cardGap}`}><div><dt>Date of birth</dt><dd>{birthLabel}</dd></div></dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Website login</h2><Link className={styles.cardLink} href={`${base}?panel=login`} prefetch={false} scroll={false}>{member.auth_user_id ? "Remove" : "Assign"}</Link></div>
          <dl className={`${styles.facts} ${styles.cardGap}`}>
            <div><dt>Personal login</dt><dd>{member.auth_user_id ? "Yes" : "None"}</dd></div>
            {invitation ? <div><dt>Invitation</dt><dd>{invitation}</dd></div> : null}
          </dl>
        </section>
      </div>
    </div>

    {honoraryPanel ? <MemberHonoraryPanel mode={honoraryPanel} memberId={id} name={member.full_name} planName={plan?.name ?? null} honorary={openHonorary ? { id: openHonorary.id, effective_from: openHonorary.effective_from } : null} plans={plans} closeHref={base}/> : null}
    {panel === "contact" ? <MemberContactPanel memberId={id} name={member.full_name} email={member.contact_email} role={member.contact_role} closeHref={base}/> : null}
    {panel === "dob" ? <MemberBirthdatePanel memberId={id} name={member.full_name} dateOfBirth={member.date_of_birth} today={today} closeHref={base}/> : null}
    {panel === "login" ? <MemberLoginPanel memberId={id} name={member.full_name} hasLogin={Boolean(member.auth_user_id)} closeHref={base}/> : null}
    {problemPayment ? <PaymentProblemPanel paymentId={problemPayment.id} name={member.full_name} year={problemYear} method={problemPayment.method} amountPence={problemPayment.amount_pence} reference={problemPayment.offline_reference ?? null} closeHref={base}/> : null}
    {panel === "payment" ? <MemberPaymentPanel memberId={id} name={member.full_name} planName={plan?.name ?? null} renewable={renewable} choices={choices} currentYear={currentYear} year={year}
      closeHref={base} yearHref={(option) => `${base}?panel=payment&year=${option}`}/> : null}
  </>;
}
