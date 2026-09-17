import { getOpenMembershipRenewalCampaign } from "@/lib/membership";
import { Award, Bell, CalendarClock, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/actions/content";
import { updateLoginEmail } from "@/lib/actions/auth";
import {
  markMembershipNotificationRead,
  openMembershipBillingPortal,
  requestOwnMembershipContactChange,
  requestStudentMembership,
  startMembershipRenewalCheckout,
  toggleMembershipAutoRenew,
} from "@/lib/actions/membership";
import { getMembershipAccount } from "@/lib/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";


export const dynamic = "force-dynamic";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const paymentMethod = (method: string) => method === "stripe" ? "online" : method.replaceAll("_", " ");
const membershipStatus = (status: string) => ({
  active: "Active",
  honorary: "Lifetime honorary",
  grace: "Renewal due",
  payment_review: "Payment being checked",
  lapsed: "Lapsed",
  suspended: "Access suspended",
  archived: "Account archived",
  scheduled: "Upcoming",
  paid: "Paid",
  void: "Cancelled",
  revoked: "Ended",
}[status] || status.replaceAll("_", " "));
const paymentStatus = (status: string) => ({
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  disputed: "Payment being checked",
  void: "Cancelled",
}[status] || status.replaceAll("_", " "));
const accountErrors: Record<string, string> = {
  "renewal-unavailable": "Online renewal is not currently available. Your existing membership and recorded payments are unchanged.",
  "payment-cancelled": "The payment was cancelled. No payment was recorded.",
  "membership-unavailable": "Online membership services are temporarily unavailable.",
};

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const membershipEnabled = membershipBillingEnabled();
  const [{ data, error }, membership] = await Promise.all([
    supabase.from("users").select("title,full_name,email,contact_number").eq("id", user.id).single(),
    membershipEnabled ? getMembershipAccount(user.id) : Promise.resolve(null),
  ]);
  const campaign = await getOpenMembershipRenewalCampaign();
  const renewalAvailable = Boolean(campaign && !membership?.history.some(term => term.membership_year === campaign.membership_year && term.status === "paid"));
  const honoraryTransitionPayment = Boolean(membership?.member.effective_state === "honorary"
    && membership.honorary?.revoked_effective_on && membership.honorary.replacement_plan_id);
  if (error) throw new Error("Unable to load account details.");
  const { data: notifications, error: notificationError } = membershipEnabled
    ? await supabase.rpc("get_own_membership_notifications", { p_limit: 20 })
    : { data: [], error: null };
  if (notificationError) throw new Error("Unable to load membership notifications.");

  return <div className="portal-content narrow">
    <header className="portal-heading"><div><p className="eyebrow dark">Your membership</p><h1>Account details</h1><p>{membershipEnabled ? "Manage your Society profile, membership term, renewal and notices." : "Keep your Society profile current and manage membership securely through MemberMojo."}</p></div><UserRound/></header>
    {query.error ? <p className="form-message error">{accountErrors[query.error] || "The requested account change could not be completed."}</p> : null}
    {query.notice ? <p className="form-message success">Your account and membership settings were updated.</p> : null}

    {membershipEnabled ? <section className="portal-card membership-account-card">
      <div className="membership-account-heading"><div><p className="eyebrow dark">Membership status</p><h2>{membership?.member.effective_state === "honorary" ? "Lifetime honorary member" : membership?.plan?.name || "Membership record pending"}</h2></div>{membership?.member.effective_state === "honorary" ? <Award/> : <CalendarClock/>}</div>
      {membership ? <>
        <dl className="membership-facts">
          <div><dt>Membership status</dt><dd>{membershipStatus(membership.member.effective_state)}</dd></div>
          <div><dt>Member since</dt><dd>{date(membership.member.joined_on)}</dd></div>
          {membership.term ? <><div><dt>Current membership</dt><dd>{membership.term.membership_year} · {membershipStatus(membership.term.status)}</dd></div><div><dt>Paid</dt><dd>{money(membership.term.amount_paid_pence)}</dd></div><div><dt>Membership ends</dt><dd>{date(membership.term.ends_on)}</dd></div><div><dt>Final renewal date</dt><dd>{date(membership.term.grace_ends_on)}</dd></div></> : null}
          {membership.honorary ? <div><dt>Honorary membership</dt><dd>{membershipStatus(membership.honorary.status)} from {date(membership.honorary.effective_from)}</dd></div> : null}
        </dl>
        {membership.student_request.available ? <form action={requestStudentMembership} className="membership-renewal-panel"><div><strong>Student membership for {membership.student_request.membership_year}</strong><p>Members aged 18–24 may request the Student fee during November. Adult remains the default until an officer approves the request, and payment waits for that decision.</p></div><PendingSubmitButton className="button outline" pendingLabel="Sending request…">Request Student membership</PendingSubmitButton></form> : membership.student_request.status === "awaiting_student_review" ? <p className="membership-account-note">The Student membership request is awaiting an officer decision. Renewal payment is paused so the wrong fee is not charged.</p> : null}
        {membership.subscription && !["canceled", "incomplete_expired"].includes(membership.subscription.status) ? <div className="membership-renewal-panel"><div><strong>Automatic renewal</strong><p>{membership.subscription.renewal_locked ? "Off — an offline payment already covers the forthcoming term." : membership.subscription.cancel_at_period_end ? "Off — your current paid term is unchanged." : `On${membership.subscription.next_charge_at ? ` — ${membership.subscription.renewal_amount_pence !== null ? `${money(membership.subscription.renewal_amount_pence)} on ` : "next charge "}${new Date(membership.subscription.next_charge_at).toLocaleDateString("en-GB")}` : ""}.`}</p></div><div className="member-action-group">{!membership.subscription.renewal_locked ? <form action={toggleMembershipAutoRenew}><input type="hidden" name="enable" value={membership.subscription.cancel_at_period_end ? "true" : "false"}/><PendingSubmitButton className="button outline" pendingLabel="Updating…">{membership.subscription.cancel_at_period_end ? "Turn on auto-renew" : "Turn off auto-renew"}</PendingSubmitButton></form> : null}<form action={openMembershipBillingPortal}><PendingSubmitButton className="button outline" pendingLabel="Opening secure payment settings…"><CreditCard/>Update payment method</PendingSubmitButton></form></div></div> : membership.member.effective_state === "honorary" && !honoraryTransitionPayment ? <p className="membership-account-note">Honorary membership has no fee, expiry or renewal.</p> : renewalAvailable || honoraryTransitionPayment ? <form action={startMembershipRenewalCheckout} className="membership-renewal-panel"><div><strong>{honoraryTransitionPayment ? `Prepare membership from ${date(membership.honorary!.revoked_effective_on!)}` : `Renew ${campaign?.membership_year} membership securely online`}</strong><p>{honoraryTransitionPayment ? "Honorary access continues until the scheduled change date. The payment page will show the exact replacement fee before payment." : "Pay the full annual fee once. No automatic renewal payment will be taken."}</p></div><PendingSubmitButton className="button dark" pendingLabel="Opening secure payment…"><CreditCard/>Continue to payment</PendingSubmitButton></form> : <div className="membership-renewal-panel"><div><strong>Membership paid</strong><p>Your {membership.term?.membership_year} membership is paid through {membership.term ? date(membership.term.ends_on) : "31 December"}. We will invite you when the membership officer opens annual renewals.</p></div></div>}
        <details className="membership-account-history"><summary>Membership and payment history</summary><div className="membership-notification-list">{membership.history.map((term) => <article key={term.id}><div><strong>{term.membership_year} · {membershipStatus(term.status)}</strong><p>{money(term.amount_paid_pence)}{term.amount_paid_pence !== term.amount_due_pence ? ` of ${money(term.amount_due_pence)}` : ""}</p>{term.payments.map((payment) => <small key={payment.id}>{paymentMethod(payment.method)} · {paymentStatus(payment.status)} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}</small>)}</div></article>)}{membership.honorary_history.map((honorary) => <article key={honorary.id}><div><strong>Lifetime honorary · {membershipStatus(honorary.status)}</strong><p>Starts {date(honorary.effective_from)}{honorary.revoked_effective_on ? ` · changes ${date(honorary.revoked_effective_on)}` : ""}</p></div></article>)}</div></details>
      </> : <p>Your account has not yet been linked to the Society’s membership register. A membership officer can complete this for you.</p>}
    </section> : null}

    <section className="portal-card account-card"><div className="security-strip"><ShieldCheck/><div><strong>Secure Society account</strong><span>{role.replaceAll("-", " ")} · {data.email}</span></div></div><form action={updateProfile} className="editor-form"><label>Title<input name="title" maxLength={10} defaultValue={data.title || ""}/></label><label>Full name<input name="full_name" defaultValue={data.full_name || ""} required/></label><label>Contact number<input name="contact_number" defaultValue={data.contact_number || ""}/></label><PendingSubmitButton className="button dark">Save profile</PendingSubmitButton></form><div className="account-action"><div><strong>Login email</strong><p>This is used only to sign in. A confirmation is required before it changes.</p></div><form action={updateLoginEmail}><label className="sr-only" htmlFor="new-login-email">New login email address</label><input id="new-login-email" type="email" name="email" defaultValue={data.email} autoComplete="email" required/><PendingSubmitButton className="button outline" pendingLabel="Sending confirmation…">Change login email</PendingSubmitButton></form></div>{membership ? <div className="account-action"><div><strong>Membership correspondence</strong><p>This may be a shared household address and does not change the personal login.</p></div><form action={requestOwnMembershipContactChange}><label className="sr-only" htmlFor="new-membership-contact-email">New membership correspondence email</label><input id="new-membership-contact-email" type="email" name="contact_email" defaultValue={membership.member.contact_email || ""} autoComplete="email" required/><select name="contact_role" defaultValue={membership.member.contact_role === "shared_household" ? "shared_household" : "self"} aria-label="Correspondence address type"><option value="self">My own address</option><option value="shared_household">Shared household address</option></select><PendingSubmitButton className="button outline" pendingLabel="Sending verification…">Change correspondence email</PendingSubmitButton></form></div> : null}{!membershipEnabled ? <div className="billing-panel"><div><strong>Membership & renewals</strong><p>MemberMojo securely manages membership applications, renewals and related payment details while website billing is unavailable.</p></div><a className="button outline" href={MEMBERMOJO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">Manage membership</a></div> : null}</section>

    {membershipEnabled ? <section className="portal-card membership-notifications-card"><header><div><p className="eyebrow dark">Notifications</p><h2>Membership updates</h2></div><Bell/></header>{notifications?.length ? <div className="membership-notification-list">{notifications.map((notification) => <article key={notification.id} className={notification.read_at ? "is-read" : "is-unread"}><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{new Date(notification.created_at).toLocaleString("en-GB")}</small></div>{!notification.read_at ? <form action={markMembershipNotificationRead}><input type="hidden" name="notification_id" value={notification.id}/><PendingSubmitButton pendingLabel="Saving…">Mark read</PendingSubmitButton></form> : null}</article>)}</div> : <p>No membership notifications yet.</p>}</section> : null}
  </div>;
}
