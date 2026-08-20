import Link from "next/link";
import { Award, Banknote, BellRing, CreditCard, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  configureMembershipPrice,
  correctMemberEligibility,
  confirmCashMembership,
  confirmExistingMemberCashRenewal,
  createHonoraryMember,
  grantHonoraryMembership,
  reviewMembershipApplication,
  resolveMembershipPaymentReview,
  resolveHonoraryPaymentConflict,
  revokeHonoraryMembership,
  setMembershipOfficer,
  stageMemberMojoCutover,
  updateMembershipPlan,
} from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export const dynamic = "force-dynamic";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const nextYearStart = `${new Date().getUTCFullYear() + 1}-01-01`;

export default async function MembershipAdministration({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; member?: string }> }) {
  const [{ role }, query] = await Promise.all([requireCapability("memberships.manage"), searchParams]);
  const admin = createServiceClient();
  const [
    applicationResult, memberResult, planResult, priceResult, honoraryResult,
    failureResult, reviewResult, committeeResult, capabilityResult, paymentReviewResult, honoraryConflictResult,
  ] = await Promise.all([
    admin.from("membership_applications")
      .select("id,full_name,contact_email,date_of_birth,payment_method,status,student_declaration,guardian_name,guardian_email,created_at,requested_plan_id")
      .in("status", ["awaiting_approval", "awaiting_cash"]).order("created_at"),
    admin.from("members").select("id,full_name,contact_email,date_of_birth,effective_state,current_plan_id").neq("effective_state", "archived").order("full_name").limit(500),
    admin.from("membership_plans").select("id,slug,name,description,minimum_age,maximum_age,requires_approval,active,stripe_product_id").order("sort_order"),
    admin.from("membership_plan_prices").select("id,plan_id,membership_year,amount_pence,stripe_price_id,active,version").eq("active", true).order("membership_year", { ascending: false }),
    admin.from("honorary_memberships").select("id,member_id,status,effective_from,reason,revoked_effective_on").in("status", ["scheduled", "active"]).order("effective_from"),
    admin.from("membership_notifications").select("id,title,recipient_email,email_attempts,last_email_error,created_at").eq("email_status", "failed").order("created_at", { ascending: false }).limit(50),
    admin.from("membership_migration_reviews").select("id,review_kind,summary,status,membership_record_id").eq("status", "pending").order("created_at").limit(100),
    admin.from("user_roles").select("user_id,role,users(full_name,email)").eq("role", "committee"),
    admin.from("user_capabilities").select("user_id").eq("capability", "memberships.manage"),
    admin.from("membership_terms").select("id,member_id,membership_year,amount_due_pence,amount_paid_pence,status")
      .eq("status", "payment_review").order("updated_at"),
    admin.from("membership_notifications").select("id,member_id,title,body,created_at")
      .eq("kind", "membership.honorary-payment-review-officer").is("read_at", null).order("created_at"),
  ]);
  const results = [applicationResult, memberResult, planResult, priceResult, honoraryResult, failureResult, reviewResult, committeeResult, capabilityResult, paymentReviewResult, honoraryConflictResult];
  if (results.some((result) => result.error)) throw new Error("Unable to load membership administration.");
  const applications = applicationResult.data ?? [];
  const members = memberResult.data ?? [];
  const plans = planResult.data ?? [];
  const prices = priceResult.data ?? [];
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const officerIds = new Set((capabilityResult.data ?? []).map((item) => item.user_id));
  const selectedMemberId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(query.member || "") ? query.member! : null;
  const [historyTermsResult, historyHonoraryResult] = selectedMemberId
    ? await Promise.all([
      admin.from("membership_terms").select("id,membership_year,status,amount_due_pence,amount_paid_pence,source,starts_on,ends_on")
        .eq("member_id", selectedMemberId).order("membership_year", { ascending: false }),
      admin.from("honorary_memberships").select("id,status,effective_from,reason,granted_at,revoked_effective_on,revocation_reason")
        .eq("member_id", selectedMemberId).order("granted_at", { ascending: false }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const historyTermIds = (historyTermsResult.data ?? []).map((term) => term.id);
  const historyPaymentsResult = historyTermIds.length
    ? await admin.from("membership_payments").select("id,term_id,method,status,amount_pence,refunded_pence,cash_receipt_reference,received_at,created_at")
      .in("term_id", historyTermIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (historyTermsResult.error || historyHonoraryResult.error || historyPaymentsResult.error) {
    throw new Error("Unable to load the membership history.");
  }

  return <div className="portal-content membership-admin-page">
    <header className="portal-heading"><div><p className="eyebrow dark">Membership officers</p><h1>Memberships</h1><p>Review applications, reconcile cash, manage annual prices and record honorary membership without creating fictitious payments.</p></div><span className="count-badge"><UsersRound/>{members.length} records</span></header>
    {query.error ? <p className="form-message error">The membership operation could not be completed: {query.error.replaceAll("-", " ")}.</p> : null}
    {query.notice ? <p className="form-message success">Membership operation completed: {query.notice.replaceAll("-", " ")}.</p> : null}

    <section className="membership-admin-summary">
      <article><UserCheck/><strong>{applications.filter((item) => item.status === "awaiting_approval").length}</strong><span>awaiting approval</span></article>
      <article><Banknote/><strong>{applications.filter((item) => item.status === "awaiting_cash").length}</strong><span>cash confirmations</span></article>
      <article><Award/><strong>{honoraryResult.data?.length ?? 0}</strong><span>honorary records</span></article>
      <article><BellRing/><strong>{failureResult.data?.length ?? 0}</strong><span>email failures</span></article>
    </section>

    <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Action queue</p><h2>Applications and cash</h2></div><CreditCard/></header><div className="membership-queue-list">{applications.map((application) => {
      const plan = planMap.get(application.requested_plan_id);
      return <article key={application.id}><div><strong>{application.full_name}</strong><span>{plan?.name || "Unknown plan"} · {application.payment_method} · {application.contact_email}</span><small>Born {new Date(`${application.date_of_birth}T12:00:00Z`).toLocaleDateString("en-GB")}{application.guardian_name ? ` · guardian ${application.guardian_name}` : ""}</small></div>{application.status === "awaiting_approval" ? <div className="membership-queue-actions"><form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="approve"/><label>Approval note<input name="reason" required minLength={5} defaultValue="Eligibility reviewed by membership officer."/></label><PendingSubmitButton pendingLabel="Approving…">Approve</PendingSubmitButton></form><form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="reject"/><label>Rejection reason<input name="reason" required minLength={5}/></label><PendingSubmitButton className="danger-button" pendingLabel="Rejecting…">Reject</PendingSubmitButton></form></div> : <form action={confirmCashMembership} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><label>Cash receipt reference<input name="receipt_reference" required/></label><PendingSubmitButton pendingLabel="Confirming…"><Banknote/>Confirm full cash payment</PendingSubmitButton></form>}</article>;
    })}{!applications.length ? <p>No applications currently need action.</p> : null}</div></section>

    {(paymentReviewResult.data ?? []).length ? <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Access retained</p><h2>Payment reviews</h2></div><ShieldCheck/></header><div className="membership-queue-list">{paymentReviewResult.data?.map((term) => <article key={term.id}><div><strong>{memberMap.get(term.member_id)?.full_name || "Member"}</strong><span>{term.membership_year} · {money(term.amount_paid_pence)} recorded against {money(term.amount_due_pence)}</span><small>A full refund or dispute was verified by Stripe. Resolve access explicitly; refunds themselves remain managed in Stripe.</small><Link href={`/admin/memberships?member=${term.member_id}`}>View full entitlement and payment history</Link></div><form action={resolveMembershipPaymentReview} className="stack-form"><input type="hidden" name="term_id" value={term.id}/><label>Resolution<select name="resolution"><option value="retain">Retain entitlement</option><option value="replace">Require replacement payment</option><option value="lapse">Lapse membership</option></select></label><label>Audited reason<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Resolving…">Resolve review</PendingSubmitButton></form></article>)}</div></section> : null}

    {(honoraryConflictResult.data ?? []).length ? <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">No automatic refund</p><h2>Honorary payment conflicts</h2></div><Award/></header><div className="membership-queue-list">{honoraryConflictResult.data?.map((conflict) => <article key={conflict.id}><div><strong>{conflict.member_id ? memberMap.get(conflict.member_id)?.full_name || "Member" : "Member"}</strong><p>{conflict.body}</p>{conflict.member_id ? <Link href={`/admin/memberships?member=${conflict.member_id}`}>Review payment history</Link> : null}</div>{conflict.member_id ? <form action={resolveHonoraryPaymentConflict} className="stack-form"><input type="hidden" name="member_id" value={conflict.member_id}/><label>Decision<select name="decision"><option value="retain">Retain payment history; no refund</option><option value="handled-in-stripe">Refund/review handled in Stripe</option></select></label><label>Audited reason<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Recording…">Record decision</PendingSubmitButton></form> : null}</article>)}</div></section> : null}

    <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Officer confirmed</p><h2>Existing member cash renewal</h2></div><Banknote/></header><p>Record one complete cash payment. Any Stripe renewal for this member is switched off first to prevent a duplicate charge.</p><form action={confirmExistingMemberCashRenewal} className="editor-form membership-cash-renewal-form"><label>Member<select name="member_id" required>{members.filter((member) => member.current_plan_id && !["honorary", "suspended", "archived"].includes(member.effective_state)).map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.effective_state}</option>)}</select></label><label>Membership year<select name="membership_year" defaultValue={new Date().getUTCMonth() === 11 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear()}><option value={new Date().getUTCFullYear()}>{new Date().getUTCFullYear()}</option><option value={new Date().getUTCFullYear() + 1}>{new Date().getUTCFullYear() + 1}</option></select></label><label>Receipt reference and audit reason<input name="receipt_reference" minLength={2} maxLength={120} required/></label><PendingSubmitButton pendingLabel="Recording payment…">Confirm full cash renewal</PendingSubmitButton></form></section>

    {selectedMemberId ? <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Immutable history</p><h2>{memberMap.get(selectedMemberId)?.full_name || "Member"}</h2></div><CreditCard/></header><form action={correctMemberEligibility} className="editor-form"><input type="hidden" name="member_id" value={selectedMemberId}/><h3>Officer-only eligibility correction</h3><label>Date of birth<input type="date" name="date_of_birth" defaultValue={memberMap.get(selectedMemberId)?.date_of_birth || ""} required/></label><label>Audited correction reason<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Correcting…">Correct date of birth</PendingSubmitButton></form><div className="membership-queue-list">{(historyTermsResult.data ?? []).map((term) => <article key={term.id}><div><strong>{term.membership_year} · {term.status}</strong><span>{money(term.amount_paid_pence)} of {money(term.amount_due_pence)} · {term.source}</span><small>{term.starts_on} to {term.ends_on}</small></div><div>{(historyPaymentsResult.data ?? []).filter((payment) => payment.term_id === term.id).map((payment) => <p key={payment.id}>{payment.method} · {payment.status} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}{payment.cash_receipt_reference ? ` · receipt ${payment.cash_receipt_reference}` : ""}</p>)}</div></article>)}{(historyHonoraryResult.data ?? []).map((honorary) => <article key={honorary.id}><div><strong>Lifetime honorary · {honorary.status}</strong><span>Effective {honorary.effective_from}{honorary.revoked_effective_on ? ` · transition ${honorary.revoked_effective_on}` : ""}</span><small>{honorary.reason}{honorary.revocation_reason ? ` · ${honorary.revocation_reason}` : ""}</small></div></article>)}{!(historyTermsResult.data?.length || historyHonoraryResult.data?.length) ? <p>No entitlement history has been recorded.</p> : null}</div></section> : null}

    <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">No payment</p><h2>Lifetime honorary membership</h2></div><Award/></header><div className="membership-admin-grid"><form action={grantHonoraryMembership} className="editor-form"><h3>Grant to an existing member</h3><label>Member<select name="member_id" required>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.effective_state}</option>)}</select></label><label>Effective from<input name="effective_from" type="date" min={new Date().toISOString().slice(0,10)} defaultValue={nextYearStart} required/></label><label>Reason<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="button dark" pendingLabel="Scheduling…">Schedule honorary membership</PendingSubmitButton></form><form action={createHonoraryMember} className="editor-form"><h3>Create a new honorary member</h3><label>Full name<input name="full_name" required/></label><label>Email<input name="contact_email" type="email" required/></label><label>Effective from<input name="effective_from" type="date" min={new Date().toISOString().slice(0,10)} defaultValue={nextYearStart} required/></label><label>Reason<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="button dark" pendingLabel="Creating…">Create and schedule</PendingSubmitButton></form></div><div className="membership-queue-list">{(honoraryResult.data ?? []).map((honorary) => <article key={honorary.id}><div><strong>{memberMap.get(honorary.member_id)?.full_name || "Former member"}</strong><span>{honorary.status} from {new Date(`${honorary.effective_from}T12:00:00Z`).toLocaleDateString("en-GB")}</span><small>{honorary.reason}</small></div>{!honorary.revoked_effective_on ? <form action={revokeHonoraryMembership} className="stack-form"><input type="hidden" name="honorary_id" value={honorary.id}/><label>Replacement tier<select name="replacement_plan_id" required>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>Transition date<input name="effective_on" type="date" min={new Date().toISOString().slice(0,10)} defaultValue={nextYearStart} required/></label><label>Reason<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Scheduling…">Schedule transition</PendingSubmitButton></form> : null}</article>)}</div></section>

    <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Stripe catalogue</p><h2>Plans and annual prices</h2></div><ShieldCheck/></header><div className="membership-plan-admin-grid">{plans.map((plan) => {
      const price = prices.find((item) => item.plan_id === plan.id);
      return <article key={plan.id}><h3>{plan.name}</h3><p>{price ? `${price.membership_year}: ${money(price.amount_pence)}` : "No current price"}<br/>{price?.stripe_price_id ? "Stripe configured" : "Stripe setup required"}</p><form action={updateMembershipPlan} className="editor-form"><input type="hidden" name="plan_id" value={plan.id}/><label>Description<textarea name="description" defaultValue={plan.description} required/></label><div className="form-grid"><label>Minimum age<input name="minimum_age" type="number" min="0" max="120" defaultValue={plan.minimum_age} required/></label><label>Maximum age<input name="maximum_age" type="number" min="0" max="120" defaultValue={plan.maximum_age} required/></label></div><label className="checkbox-row"><input type="checkbox" name="requires_approval" defaultChecked={plan.requires_approval}/>Officer approval required</label><label className="checkbox-row"><input type="checkbox" name="active" defaultChecked={plan.active}/>Available for applications</label><PendingSubmitButton pendingLabel="Saving plan…">Save plan rules</PendingSubmitButton></form><form action={configureMembershipPrice} className="editor-form"><input type="hidden" name="plan_id" value={plan.id}/><label>Membership year<input name="membership_year" type="number" min={new Date().getUTCFullYear()} defaultValue={price?.membership_year ?? new Date().getUTCFullYear() + 1} required/></label><label>Annual fee (£)<input name="amount" type="number" min="1" max="10000" step="0.01" defaultValue={price ? price.amount_pence / 100 : ""} required/></label><PendingSubmitButton pendingLabel="Creating Stripe price…">Publish immutable price</PendingSubmitButton></form></article>;
    })}</div></section>

    {role === "administrator" ? <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Least privilege</p><h2>Membership officers</h2></div><UserCheck/></header><div className="membership-queue-list">{(committeeResult.data ?? []).map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const enabled = officerIds.has(row.user_id);
      return <article key={row.user_id}><div><strong>{user?.full_name || user?.email || "Committee member"}</strong><span>{enabled ? "Membership access granted" : "No membership access"}</span></div><form action={setMembershipOfficer}><input type="hidden" name="user_id" value={row.user_id}/><input type="hidden" name="enabled" value={enabled ? "false" : "true"}/><PendingSubmitButton pendingLabel="Updating…">{enabled ? "Revoke officer access" : "Make membership officer"}</PendingSubmitButton></form></article>;
    })}</div></section> : null}

    <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Final migration</p><h2>MemberMojo cutover</h2></div><UsersRound/></header><p>This one-time operation stages canonical members from the final imported active snapshot. It is idempotent, preserves source IDs, and sends uncertain honorary, shared-email and unknown-plan records to review.</p><form action={stageMemberMojoCutover}><PendingSubmitButton className="button outline" pendingLabel="Staging final cutover…">Stage final imported snapshot</PendingSubmitButton></form>{reviewResult.data?.length ? <div className="membership-queue-list">{reviewResult.data.map((review) => <article key={review.id}><div><strong>{review.review_kind.replaceAll("_", " ")}</strong><p>{review.summary}</p><small>Source record {review.membership_record_id}</small></div></article>)}</div> : <p>No unresolved migration reviews.</p>}</section>

    {failureResult.data?.length ? <section className="portal-card membership-admin-section"><header><div><p className="eyebrow dark">Delivery health</p><h2>Notification failures</h2></div><BellRing/></header><div className="membership-queue-list">{failureResult.data.map((failure) => <article key={failure.id}><div><strong>{failure.title}</strong><span>{failure.recipient_email} · {failure.email_attempts} attempts</span><small>{failure.last_email_error || "Delivery failed"}</small></div></article>)}</div></section> : null}
  </div>;
}
