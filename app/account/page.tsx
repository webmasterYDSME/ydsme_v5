import { Award, Bell, CalendarClock, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { updateProfile } from "@/lib/actions/content";
import { updateLoginEmail } from "@/lib/actions/auth";
import {
  markMembershipNotificationRead,
  openMembershipBillingPortal,
  startMembershipRenewalCheckout,
  toggleMembershipAutoRenew,
} from "@/lib/actions/membership";
import { getMembershipAccount } from "@/lib/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { membershipBillingEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const membershipEnabled = membershipBillingEnabled();
  const [{ data, error }, membership] = await Promise.all([
    supabase.from("users").select("title,full_name,email,contact_number").eq("id", user.id).single(),
    membershipEnabled ? getMembershipAccount(user.id) : Promise.resolve(null),
  ]);
  if (error) throw new Error("Unable to load account details.");
  const { data: notifications, error: notificationError } = membershipEnabled
    ? await createServiceClient()
      .from("membership_notifications")
      .select("id,title,body,kind,action_href,read_at,created_at")
      .eq("recipient_user_id", user.id).eq("portal_visible", true)
      .order("created_at", { ascending: false }).limit(20)
    : { data: [], error: null };
  if (notificationError) throw new Error("Unable to load membership notifications.");

  return <div className="portal-content narrow">
    <header className="portal-heading"><div><p className="eyebrow dark">Your membership</p><h1>Account details</h1><p>Manage your Society profile, membership term, renewal and notices.</p></div><UserRound/></header>
    {query.error ? <p className="form-message error">The requested account change could not be completed.</p> : null}
    {query.notice ? <p className="form-message success">Your account and membership settings were updated.</p> : null}

    {membershipEnabled ? <section className="portal-card membership-account-card">
      <div className="membership-account-heading"><div><p className="eyebrow dark">Membership status</p><h2>{membership?.member.effective_state === "honorary" ? "Lifetime honorary member" : membership?.plan?.name || "Membership record pending"}</h2></div>{membership?.member.effective_state === "honorary" ? <Award/> : <CalendarClock/>}</div>
      {membership ? <>
        <dl className="membership-facts">
          <div><dt>Effective status</dt><dd>{membership.member.effective_state.replaceAll("_", " ")}</dd></div>
          <div><dt>Member since</dt><dd>{date(membership.member.joined_on)}</dd></div>
          {membership.term ? <><div><dt>Current term</dt><dd>{membership.term.membership_year} · {membership.term.status}</dd></div><div><dt>Paid</dt><dd>{money(membership.term.amount_paid_pence)} of {money(membership.term.amount_due_pence)}</dd></div><div><dt>Term ends</dt><dd>{date(membership.term.ends_on)}</dd></div><div><dt>Grace ends</dt><dd>{date(membership.term.grace_ends_on)}</dd></div></> : null}
          {membership.honorary ? <div><dt>Honorary status</dt><dd>{membership.honorary.status} from {date(membership.honorary.effective_from)}</dd></div> : null}
        </dl>
        {membership.subscription && !["canceled", "incomplete_expired"].includes(membership.subscription.status) ? <div className="membership-renewal-panel"><div><strong>Automatic renewal</strong><p>{membership.subscription.renewal_locked ? "Off — a cash payment already covers the forthcoming term." : membership.subscription.cancel_at_period_end ? "Off — your current paid term is unchanged." : `On${membership.subscription.next_charge_at ? ` — ${membership.subscription.renewal_amount_pence !== null ? `${money(membership.subscription.renewal_amount_pence)} on ` : "next charge "}${new Date(membership.subscription.next_charge_at).toLocaleDateString("en-GB")}` : ""}.`}</p></div><div className="member-action-group">{!membership.subscription.renewal_locked ? <form action={toggleMembershipAutoRenew}><input type="hidden" name="enable" value={membership.subscription.cancel_at_period_end ? "true" : "false"}/><PendingSubmitButton className="button outline" pendingLabel="Updating…">{membership.subscription.cancel_at_period_end ? "Turn on auto-renew" : "Turn off auto-renew"}</PendingSubmitButton></form> : null}<form action={openMembershipBillingPortal}><PendingSubmitButton className="button outline" pendingLabel="Opening Stripe…"><CreditCard/>Update payment method</PendingSubmitButton></form></div></div> : membership.member.effective_state !== "honorary" ? <form action={startMembershipRenewalCheckout} className="membership-renewal-panel"><div><strong>Renew securely with Stripe</strong><p>Automatic annual renewal is enabled by default. Clear the box to pay only this term; either choice can be changed later while the subscription exists.</p><label className="checkbox-row"><input type="checkbox" name="auto_renew" defaultChecked/>Automatically renew each 1 January</label></div><PendingSubmitButton className="button dark" pendingLabel="Opening Stripe…"><CreditCard/>Continue to Stripe</PendingSubmitButton></form> : <p className="membership-account-note">Honorary membership has no fee, expiry or renewal.</p>}
        <details className="membership-account-history"><summary>Payment and entitlement history</summary><div className="membership-notification-list">{membership.history.map((term) => <article key={term.id}><div><strong>{term.membership_year} · {term.status}</strong><p>{money(term.amount_paid_pence)} of {money(term.amount_due_pence)}</p>{term.payments.map((payment) => <small key={payment.id}>{payment.method} · {payment.status} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}</small>)}</div></article>)}{membership.honorary_history.map((honorary) => <article key={honorary.id}><div><strong>Lifetime honorary · {honorary.status}</strong><p>Effective {date(honorary.effective_from)}{honorary.revoked_effective_on ? ` · transition ${date(honorary.revoked_effective_on)}` : ""}</p></div></article>)}</div></details>
      </> : <p>Your portal account has not yet been linked to the canonical membership register. A membership officer can complete this during cutover.</p>}
    </section> : null}

    <section className="portal-card account-card"><div className="security-strip"><ShieldCheck/><div><strong>Secure Society account</strong><span>{role.replaceAll("-", " ")} · {data.email}</span></div></div><form action={updateProfile} className="editor-form"><label>Title<input name="title" defaultValue={data.title || ""}/></label><label>Full name<input name="full_name" defaultValue={data.full_name || ""} required/></label><label>Contact number<input name="contact_number" defaultValue={data.contact_number || ""}/></label><PendingSubmitButton className="button dark">Save profile</PendingSubmitButton></form><div className="account-action"><div><strong>Login email</strong><p>A confirmation will be sent before the new address becomes active.</p></div><form action={updateLoginEmail} className="disabled-form"><input type="email" name="email" defaultValue={data.email} required disabled/><PendingSubmitButton className="button outline" pendingLabel="Updating…" disabled>Change email</PendingSubmitButton></form></div></section>

    {membershipEnabled ? <section className="portal-card membership-notifications-card"><header><div><p className="eyebrow dark">Notifications</p><h2>Membership updates</h2></div><Bell/></header>{notifications?.length ? <div className="membership-notification-list">{notifications.map((notification) => <article key={notification.id} className={notification.read_at ? "is-read" : "is-unread"}><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{new Date(notification.created_at).toLocaleString("en-GB")}</small></div>{!notification.read_at ? <form action={markMembershipNotificationRead}><input type="hidden" name="notification_id" value={notification.id}/><PendingSubmitButton pendingLabel="Saving…">Mark read</PendingSubmitButton></form> : null}</article>)}</div> : <p>No membership notifications yet.</p>}</section> : null}
  </div>;
}
