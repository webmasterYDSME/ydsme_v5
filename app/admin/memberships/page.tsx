import { MembershipLaunchOperations } from "./MembershipLaunchOperations";
import { MembershipPaymentSettings } from "./MembershipPaymentSettings";
import styles from "./memberships.module.css";
import { PortalTabs } from "@/app/components/PortalTabs";
import { PortalPagination } from "@/app/components/PortalPagination";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Award, Banknote, BellRing, ChevronDown, CreditCard, Download, Landmark, ShieldCheck, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  configureMembershipPrice,
  completeManualMembershipContact,
  assignMemberPortalLogin,
  correctMemberEligibility,
  confirmExistingMemberOfflineRenewal,
  confirmOfflineMembership,
  createOfficerManagedMembership,
  createHonoraryMember,
  grantHonoraryMembership,
  recordOfflineApplicationPayment,
  removeMemberPortalLogin,
  requestMemberContactChange,
  requestMembershipReportExport,
  resolveMembershipMigrationReview,
  reportOfflineMembershipPaymentFailure,
  retryMembershipNotification,
  reviewMembershipApplication,
  reviewStudentMembershipRequest,
  resolveMembershipPaymentReview,
  resolveHonoraryPaymentConflict,
  revokeHonoraryMembership,
  stageMemberMojoCutover,
  updateMembershipPlan,
} from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { OfficerMembershipEligibilityFields } from "@/app/admin/memberships/OfficerMembershipEligibilityFields";
import { OfficerRenewalPaymentForm } from "@/app/admin/memberships/OfficerRenewalPaymentForm";
import { membershipAdministrationEnabled } from "@/lib/features";
import { proratedMembershipFee } from "@/lib/membership-rules";

export const dynamic = "force-dynamic";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const nextYearStart = `${new Date().getUTCFullYear() + 1}-01-01`;
const today = new Date().toISOString().slice(0, 10);
const paymentMethodName = (method: string | null) => ({
  cash: "cash",
  bank_transfer: "bank transfer",
  cheque: "cheque",
  stripe: "online payment",
}[method || ""] || "payment");
const memberStateName = (state: string) => ({
  active: "Active",
  honorary: "Honorary",
  grace: "Payment overdue",
  payment_review: "Payment needs checking",
  lapsed: "Not currently active",
  suspended: "Suspended",
  archived: "Archived",
}[state] || state.replaceAll("_", " "));
const reviewKindName = (kind: string) => ({
  honorary_candidate: "Possible honorary member",
  shared_email: "Email address used by more than one person",
  missing_email: "No email address",
  portal_conflict: "Account link needs checking",
  unknown_plan: "Membership type needs checking",
}[kind] || kind.replaceAll("_", " "));

function MembershipAdminSection({
  id,
  eyebrow,
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  visible = true,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;
  return <details id={id} className={`portal-card membership-admin-section ${className}`.trim()} open={defaultOpen}>
    <summary>
      <span className="membership-section-summary-copy">
        <span className="eyebrow dark">{eyebrow}</span>
        <span className="membership-section-title" role="heading" aria-level={2}>{title}</span>
        <span className="membership-section-description">{description}</span>
      </span>
      <span className="membership-section-icon" aria-hidden="true">{icon}</span>
      <ChevronDown className="membership-section-toggle" aria-hidden="true"/>
    </summary>
    <div className="membership-section-body">{children}</div>
  </details>;
}

export default async function MembershipAdministration({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; member?: string; section?: string; view?: string; q?: string; page?: string }> }) {
  if (!membershipAdministrationEnabled()) redirect("/administrator/member-import");
  const [, query] = await Promise.all([requireCapability("memberships.manage"), searchParams]);
  const admin = createServiceClient();
  const [
    applicationResult, memberResult, planResult, priceResult, honoraryResult,
    failureResult, reviewResult, paymentReviewResult, honoraryConflictResult, manualContactResult, pendingOfflineResult,
    checkoutProblemResult, checkoutAttemptResult, webhookFailureResult, providerCommandResult, deliveryProblemResult, studentRequestResult, renewalTransitionResult, renewalTermResult,
  ] = await Promise.all([
    admin.from("membership_applications")
      .select("id,full_name,contact_email,date_of_birth,payment_method,status,student_declaration,manual_verification,guardian_name,guardian_email,guardian_verified_at,created_at,requested_plan_id,membership_offline_payment_records(id,status,payment_reference,received_on)")
      .in("status", ["awaiting_approval", "awaiting_cash", "awaiting_bank_transfer", "awaiting_cheque"]).order("created_at", { ascending: false }),
    admin.from("members").select("id,full_name,contact_email,contact_email_verified_at,contact_role,contact_number,date_of_birth,effective_state,current_plan_id,auth_user_id,portal_invitation_status,honorary_memberships(status,effective_from,revoked_effective_on,replacement_plan_id)").neq("effective_state", "archived").order("full_name"),
    admin.from("membership_plans").select("id,slug,name,description,minimum_age,maximum_age,requires_approval,active,stripe_product_id").order("sort_order"),
    admin.from("membership_plan_prices").select("id,plan_id,membership_year,amount_pence,stripe_price_id,active,version,carried_forward_from_id").eq("active", true).order("membership_year", { ascending: false }),
    admin.from("honorary_memberships").select("id,member_id,status,effective_from,reason,revoked_effective_on").in("status", ["scheduled", "active"]).order("effective_from"),
    admin.from("membership_notifications").select("id,member_id,application_id,title,recipient_email,email_attempts,last_email_error,created_at").eq("email_status", "failed").order("created_at", { ascending: false }).limit(50),
    admin.from("membership_migration_reviews").select("id,review_kind,summary,status,membership_record_id").eq("status", "pending").order("created_at").limit(100),
    admin.from("membership_terms").select("id,member_id,membership_year,amount_due_pence,amount_paid_pence,status")
      .eq("status", "payment_review").order("updated_at"),
    admin.from("membership_notifications").select("id,member_id,title,body,created_at")
      .eq("kind", "membership.honorary-payment-review-officer").is("read_at", null).order("created_at"),
    admin.from("membership_notifications").select("id,member_id,title,body,created_at")
      .eq("kind", "membership.manual-contact-officer").is("read_at", null).order("created_at"),
    admin.from("membership_terms").select("id,member_id,membership_year,amount_due_pence,expected_payment_method")
      .eq("status", "scheduled").not("expected_payment_method", "is", null).order("created_at"),
    admin.from("membership_notifications").select("id,application_id,title,body,action_href,created_at")
      .eq("kind", "membership.application-payment-attention-officer").is("read_at", null).order("created_at"),
    admin.from("membership_checkout_attempts")
      .select("id,application_id,member_id,status,last_error,updated_at")
      .in("status", ["failed", "payment_review"]).order("updated_at", { ascending: false }).limit(100),
    admin.from("stripe_webhook_events")
      .select("stripe_event_id,event_type,processing_status,last_error,claimed_at")
      .eq("processing_status", "failed").order("claimed_at", { ascending: false }).limit(100),
    admin.from("membership_provider_commands")
      .select("id,member_id,command_type,status,attempts,last_error,updated_at")
      .eq("status", "failed").order("updated_at", { ascending: false }).limit(100),
    admin.from("membership_delivery_events")
      .select("id,notification_id,event_type,safe_detail,occurred_at")
      .in("event_type", ["bounced", "complained", "suppressed"]).order("occurred_at", { ascending: false }).limit(100),
    admin.from("membership_plan_transitions")
      .select("id,member_id,membership_year,status,requested_at,to_plan_id")
      .eq("status", "awaiting_student_review").order("requested_at"),
    admin.from("membership_plan_transitions")
      .select("member_id,membership_year,status,to_plan_id")
      .in("status", ["scheduled", "approved", "awaiting_student_review"])
      .gte("membership_year", new Date().getUTCFullYear()).lte("membership_year", new Date().getUTCFullYear() + 1),
    admin.from("membership_terms")
      .select("member_id,membership_year,status,amount_due_pence,amount_paid_pence,source")
      .gte("membership_year", new Date().getUTCFullYear()).lte("membership_year", new Date().getUTCFullYear() + 1),
  ]);
  const results = [applicationResult, memberResult, planResult, priceResult, honoraryResult, failureResult, reviewResult, paymentReviewResult, honoraryConflictResult, manualContactResult, pendingOfflineResult, checkoutProblemResult, checkoutAttemptResult, webhookFailureResult, providerCommandResult, deliveryProblemResult, studentRequestResult, renewalTransitionResult, renewalTermResult];
  if (results.some((result) => result.error)) throw new Error("Unable to load membership administration.");
  const { data: reportExports, error: reportError } = await admin.from("membership_report_exports")
    .select("id,status,storage_path,row_counts,financial_totals,created_at,completed_at,expires_at,last_error")
    .order("created_at", { ascending: false }).limit(10);
  if (reportError) throw new Error("Unable to load membership reports.");
  const { count: verificationCount, error: verificationCountError } = await admin.from("membership_applications")
    .select("id", { count: "exact", head: true }).eq("status", "converted").eq("manual_verification", "pending");
  if (verificationCountError) throw new Error("Unable to load membership verification work.");
  const applications = applicationResult.data ?? [];
  const members = memberResult.data ?? [];
  const plans = planResult.data ?? [];
  const prices = priceResult.data ?? [];
  const checkoutProblems = checkoutProblemResult.data ?? [];
  const paymentConfigurationReady = Boolean((process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY)
    && (process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET));
  const localEmail = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(process.env.NEXT_PUBLIC_SITE_URL || "")
    && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    && Boolean(process.env.LOCAL_MAILPIT_URL);
  const emailConfigurationReady = Boolean(process.env.MEMBERSHIP_FROM_EMAIL
    && (localEmail || (process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET)));
  const checkoutProblemCount = (paymentConfigurationReady ? 0 : 1) + checkoutProblems.length + (checkoutAttemptResult.data?.length ?? 0)
    + (webhookFailureResult.data?.length ?? 0) + (providerCommandResult.data?.length ?? 0);
  const deliveryProblemCount = (emailConfigurationReady ? 0 : 1)
    + (failureResult.data?.length ?? 0) + (deliveryProblemResult.data?.length ?? 0);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const manualContactTasks = Array.from(new Map((manualContactResult.data ?? [])
    .filter((task) => task.member_id)
    .map((task) => [task.member_id!, task])).values());
  const renewableMembers = members.filter((member) => {
    if (!member.current_plan_id || ["suspended", "archived"].includes(member.effective_state)) return false;
    if (member.effective_state !== "honorary") return true;
    const honorary = member.honorary_memberships as Array<{ revoked_effective_on: string | null }> | null;
    return Boolean(honorary?.some((item) => item.revoked_effective_on));
  });
  const currentYear = new Date().getUTCFullYear();
  const renewalChoices = renewableMembers.flatMap((member) => [currentYear, currentYear + 1].map((membershipYear) => {
    const honoraryRows = member.honorary_memberships as Array<{ status: string; effective_from: string; revoked_effective_on: string | null; replacement_plan_id: string | null }> | null;
    const honoraryForYear = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.effective_from <= `${membershipYear}-12-31`
      && (!item.revoked_effective_on || item.revoked_effective_on > `${membershipYear}-01-01`)) ?? null;
    const honoraryTransition = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.revoked_effective_on?.startsWith(`${membershipYear}-`) && item.replacement_plan_id) ?? null;
    if (honoraryForYear && !honoraryTransition) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "Honorary membership covers this year, so no payment should be recorded.",
    };
    const transition = (renewalTransitionResult.data ?? []).find((item) => item.member_id === member.id
      && item.membership_year === membershipYear);
    if (transition?.status === "awaiting_student_review") return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "The Student membership request must be decided before payment is recorded.",
    };
    const planId = honoraryTransition?.replacement_plan_id ?? transition?.to_plan_id ?? member.current_plan_id;
    const price = prices.find((item) => item.plan_id === planId && item.membership_year === membershipYear)
      ?? prices.find((item) => item.plan_id === planId && item.membership_year < membershipYear);
    if (!price) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: `No annual fee is available for ${membershipYear}.`,
    };
    const term = (renewalTermResult.data ?? []).find((item) => item.member_id === member.id
      && item.membership_year === membershipYear);
    if (term?.status === "paid" && term.amount_paid_pence >= term.amount_due_pence) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: `This member's ${membershipYear} membership is already paid.`,
    };
    if (term?.status === "payment_review") return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "Resolve the existing payment review before recording another payment.",
    };
    if (term?.status === "scheduled" && term.amount_paid_pence === 0 && ["officer", "application"].includes(term.source)) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: term.amount_due_pence,
      note: "This is the amount already due for the pending membership term.",
    };
    if (honoraryTransition?.revoked_effective_on && !honoraryTransition.revoked_effective_on.endsWith("-01-01")) {
      const transitionDate = new Date(`${honoraryTransition.revoked_effective_on}T12:00:00Z`);
      return {
        member_id: member.id, membership_year: membershipYear,
        amount_pence: proratedMembershipFee(price.amount_pence, transitionDate),
        note: `Reduced from the ${money(price.amount_pence)} annual fee from the date honorary membership ends.`,
      };
    }
    return {
      member_id: member.id, membership_year: membershipYear, amount_pence: price.amount_pence,
      note: `Full annual fee for ${membershipYear}.`,
    };
  }));
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
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
    ? await admin.from("membership_payments").select("id,term_id,method,status,amount_pence,refunded_pence,cash_receipt_reference,offline_reference,received_at,cleared_at,created_at,recorded_by_actor_id,administrative_actors(reference_code,display_name,status)")
      .in("term_id", historyTermIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (historyTermsResult.error || historyHonoraryResult.error || historyPaymentsResult.error) {
    throw new Error("Unable to load the membership history.");
  }
  const sectionViews: Record<string, string> = {
    applications: "attention", "student-requests": "attention", "manual-contact": "attention", "email-failures": "attention",
    "online-payment-problems": "payments", "pending-payments": "payments", "payment-reviews": "payments", "honorary-conflicts": "payments", renewals: "payments",
    "payment-settings": "payments", "add-member": "members", "member-history": "members", honorary: "members", plans: "plans", reports: "reports", "membermojo-import": "reports",
  };
  const view = (query.section && sectionViews[query.section]) || (selectedMemberId ? "members" : ["members", "payments", "plans", "reports"].includes(query.view || "") ? query.view! : "attention");
  const sectionVisible = (id: string) => {
    if (query.section && sectionViews[query.section]) return id === query.section;
    if (selectedMemberId) return id === "member-history";
    if (view === "members") return false;
    if (id === "membermojo-import" || id === "email-failures") return false;
    if (id === "online-payment-problems" && checkoutProblemCount === 0) return false;
    return sectionViews[id] === view;
  };
  const sectionOpen = (section: string, openWhenBusy = false) => Boolean(query.section === section || section === "member-history" || ["applications", "renewals", "plans", "reports"].includes(section) || openWhenBusy);
  const attentionCount = (verificationCount ?? 0) + (pendingOfflineResult.data?.length ?? 0) + applications.length + (studentRequestResult.data?.length ?? 0) + manualContactTasks.length + deliveryProblemCount + checkoutProblemCount + (paymentReviewResult.data?.length ?? 0) + (honoraryConflictResult.data?.length ?? 0);
  const emptyQueueCounts: Record<string, number> = { "manual-contact": manualContactTasks.length, "student-requests": studentRequestResult.data?.length ?? 0, "email-failures": deliveryProblemCount, "pending-payments": pendingOfflineResult.data?.length ?? 0, "payment-reviews": paymentReviewResult.data?.length ?? 0, "honorary-conflicts": honoraryConflictResult.data?.length ?? 0 };
  const term = (query.q || "").trim().toLocaleLowerCase();
  const filteredMembers = members.filter(member => !term || member.full_name.toLocaleLowerCase().includes(term) || member.contact_email?.toLocaleLowerCase().includes(term));
  const registerPages = Math.max(1, Math.ceil(filteredMembers.length / 25));
  const registerPage = Math.min(registerPages, Math.max(1, Number.parseInt(query.page || "1",10) || 1));
  const visibleMembers = filteredMembers.slice((registerPage-1)*25, registerPage*25);
  const viewCopy = ({
    attention: { eyebrow: "Daily work", title: "Tasks requiring attention", description: "Work through these queues from the top. Completed tasks disappear automatically." },
    members: { eyebrow: "Membership records", title: "Find and manage a member", description: "Search the register, review membership history, or add someone who joined offline." },
    payments: { eyebrow: "Money and renewals", title: "Manage payments and renewals", description: "Open annual renewals, record offline payments, and resolve payment exceptions." },
    plans: { eyebrow: "Membership setup", title: "Types and annual fees", description: "Review the available memberships and change a fee only when a new amount should take effect." },
    reports: { eyebrow: "Records and migration", title: "Reports and MemberMojo", description: "Prepare bookkeeping records or complete the one-time MemberMojo migration work." },
  } as const)[view as "attention" | "members" | "payments" | "plans" | "reports"];

  return <div className={`portal-content membership-admin-page ${styles.workspace}`}>
    <header className={styles.pageHeader}><div><p className="eyebrow dark">Membership team</p><h1>Manage memberships</h1><p>Review applications, record payments and look after the member register.</p></div><Link className="button dark" href="/admin/memberships?section=add-member"><UserPlus/>Add membership</Link></header>
    {query.error ? <p className="form-message error">That change could not be completed. Check the details and try again. <small>({query.error.replaceAll("-", " ")})</small></p> : null}
    {query.notice ? <p className="form-message success">{query.notice === "membership-payment-settings-saved" ? "Membership payment instructions saved as a new version." : query.notice === "price-unchanged" ? "No fee change was needed. The current annual fee will continue automatically." : "Done. The membership record has been updated."}</p> : null}
    {reviewResult.data?.length ? <p className="form-message error">Website membership cannot be moved to live public use until {reviewResult.data.length} imported record{reviewResult.data.length === 1 ? "" : "s"} have been reviewed. <Link href="/admin/memberships?section=membermojo-import">Review imported records</Link>.</p> : null}

    <PortalTabs label="Membership workspace" tabs={[
      { href: "/admin/memberships", label: "Tasks", count: attentionCount, current: view === "attention" },
      { href: "/admin/memberships?view=members", label: "Members", current: view === "members" },
      { href: "/admin/memberships?view=payments", label: "Payments & renewals", current: view === "payments" },
      { href: "/admin/memberships?view=plans", label: "Types & fees", current: view === "plans" },
      { href: "/admin/memberships?view=reports", label: "Reports", current: view === "reports" },
    ]}/>
    {!query.section && !selectedMemberId ? <section className={styles.viewIntro}><p className="eyebrow dark">{viewCopy.eyebrow}</p><h2>{viewCopy.title}</h2><p>{viewCopy.description}</p></section> : null}
    {view === "payments" && <p className={styles.registerNote}>{query.section === "payment-settings" ? <Link href="/admin/memberships?view=payments">Back to payments</Link> : <Link className="button outline" href="/admin/memberships?section=payment-settings">Payment settings</Link>}</p>}
    {query.section === "payment-settings" && <MembershipPaymentSettings/>}
    {view === "attention" && <>
      <div className={styles.overview}>
        <a href="#verification"><ShieldCheck/><strong>{verificationCount ?? 0}</strong><span>Paid memberships to verify</span></a>
        <Link href="/admin/memberships?section=applications"><Banknote/><strong>{applications.length}</strong><span>Application payments waiting</span></Link>
        <Link href="/admin/memberships?section=pending-payments"><CreditCard/><strong>{pendingOfflineResult.data?.length ?? 0}</strong><span>Renewal payments waiting</span></Link>
        <Link href="/admin/memberships?section=manual-contact"><BellRing/><strong>{manualContactTasks.length}</strong><span>Members to contact</span></Link>
      </div>
      {(checkoutProblemCount > 0 || deliveryProblemCount > 0) && <div className={styles.serviceNotice}><ShieldCheck/><span>{checkoutProblemCount > 0 && <Link href="/admin/memberships?section=online-payment-problems">Online payments need attention ({checkoutProblemCount})</Link>}{deliveryProblemCount > 0 && <Link href="/admin/memberships?section=email-failures">Email delivery needs attention ({deliveryProblemCount})</Link>}</span></div>}
    </>}
    {view === "attention" && ((paymentReviewResult.data?.length ?? 0) > 0 || (honoraryConflictResult.data?.length ?? 0) > 0) && <p className={styles.registerNote}><Link href="/admin/memberships?view=payments">Review refunds, disputes and honorary payment checks →</Link></p>}
    {query.section && emptyQueueCounts[query.section] === 0 && <div className="membership-empty-state"><UserCheck/><strong>Nothing waiting here</strong><p>This queue is up to date.</p></div>}
    {view === "members" && !query.section && !selectedMemberId && <section className={styles.register}>
      <form className={styles.search} method="get"><input type="hidden" name="view" value="members"/><label>Find a membership<input name="q" defaultValue={query.q || ""} placeholder="Name or correspondence email"/></label><button className="button dark">Search</button>{query.q && <Link href="/admin/memberships?view=members">Clear</Link>}</form>
      <p className={styles.registerNote}>Membership records and renewals. Manage website accounts in <Link href="/admin/members">People</Link>.</p>
      {filteredMembers.length ? <><div className={styles.memberList}>{visibleMembers.map(member => <article key={member.id}><div><h2>{member.full_name}</h2><p>{member.contact_email || "No correspondence email"}</p></div><span>{memberStateName(member.effective_state)}</span><Link className="button outline" href={`/admin/memberships?member=${member.id}&section=member-history`}>View membership</Link></article>)}</div><PortalPagination currentPage={registerPage} totalPages={registerPages} totalItems={filteredMembers.length} itemLabel="memberships" href={page => `/admin/memberships?${new URLSearchParams({view:"members", q:query.q || "", page:String(page)})}`} ariaLabel="Membership register pages"/></> : <div className="membership-empty-state"><UsersRound/><strong>No memberships found</strong><p>{members.length ? "Try another name or email address." : "Website accounts and membership records are separate. Add a membership to start the register."}</p></div>}
      <Link className={styles.secondaryLink} href="/admin/memberships?section=honorary">Manage honorary memberships</Link>
    </section>}
    {view === "members" && (query.section || selectedMemberId) && <Link className={styles.secondaryLink} href="/admin/memberships?view=members">← Back to member register</Link>}
    {(view === "payments" || view === "attention") && <MembershipLaunchOperations payments={view === "payments"}/>}
    {view === "reports" && <div className={styles.reportTools}><form action={requestMembershipReportExport}><PendingSubmitButton className="button dark" pendingLabel="Preparing report…"><Download/>Prepare records download</PendingSubmitButton></form><Link href="/admin/memberships?section=membermojo-import">MemberMojo import & review</Link></div>}

    <MembershipAdminSection id="applications" visible={sectionVisible("applications")} className="membership-admin-primary" eyebrow="Offline applications" title="Application payments waiting" description="These applications are saved. Open a payment task only after the cash, bank transfer or cleared cheque has arrived." icon={<CreditCard/>} defaultOpen={sectionOpen("applications", true)}><div className="membership-queue-list">{applications.map((application) => {
      const plan = planMap.get(application.requested_plan_id);
      const offlineRecords = application.membership_offline_payment_records as Array<{ id: string; status: string; payment_reference: string | null; received_on: string | null }> | null;
      const received = offlineRecords?.find((record) => record.status === "received");
      return <article className={styles.taskCard} key={application.id}>
        <div className={styles.taskSummary}>
          <div className={styles.taskHeading}><strong>{application.full_name}</strong><span className={styles.statusBadge}>{received ? "Cheque received" : "Awaiting payment"}</span></div>
          <span>{plan?.name || "Membership type not found"} · {paymentMethodName(application.payment_method)}</span>
          <small>{application.contact_email}</small>
          <small>Date of birth: {new Date(`${application.date_of_birth}T12:00:00Z`).toLocaleDateString("en-GB")}</small>
          {application.guardian_name ? <small>Guardian: {application.guardian_name} · consent will be checked after payment</small> : null}
          {received?.received_on ? <small>Received {new Date(`${received.received_on}T12:00:00Z`).toLocaleDateString("en-GB")}</small> : null}
        </div>
        <details className={styles.taskDisclosure}>
          <summary><span>{application.status === "awaiting_approval" ? "Review legacy application" : received ? "Complete cheque payment" : "Record payment"}<small>{application.status === "awaiting_approval" ? "Approve or decline this older application" : "Open when the full payment has arrived"}</small></span><ChevronDown aria-hidden="true"/></summary>
          {application.status === "awaiting_approval" ? <div className="membership-queue-actions"><form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" required minLength={5} defaultValue="Membership details checked by an officer."/></label><PendingSubmitButton pendingLabel="Approving…">Approve application</PendingSubmitButton></form><form action={reviewMembershipApplication} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" required minLength={5}/></label><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Decline application</PendingSubmitButton></form></div> : <div className="membership-queue-actions">{application.payment_method === "cheque" && !received ? <form action={recordOfflineApplicationPayment} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="event" value="received"/><label>Cheque reference<input name="payment_reference" required/></label><label>Date received<input type="date" name="received_on" defaultValue={today} required/></label><PendingSubmitButton pendingLabel="Saving…">Mark cheque as received</PendingSubmitButton></form> : null}<form action={confirmOfflineMembership} className="stack-form"><input type="hidden" name="application_id" value={application.id}/><input type="hidden" name="payment_method" value={application.payment_method}/><label>Receipt or payment reference<input name="payment_reference" defaultValue={received?.payment_reference || ""} required/></label><label>Date received<input type="date" name="received_on" defaultValue={received?.received_on || today} required/></label>{application.payment_method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<PendingSubmitButton pendingLabel="Confirming…"><Banknote/>Mark paid and activate</PendingSubmitButton></form></div>}
        </details>
      </article>;
    })}{!applications.length ? <div className="membership-empty-state"><UserCheck/><strong>Nothing to review</strong><p>There are no applications or payments waiting.</p></div> : null}</div></MembershipAdminSection>

    <MembershipAdminSection id="online-payment-problems" visible={sectionVisible("online-payment-problems")} className={checkoutProblemCount ? "membership-attention-section membership-admin-predominant" : "membership-admin-predominant"} eyebrow={checkoutProblemCount ? "Needs attention" : "System check"} title={checkoutProblemCount ? "Online payments need attention" : "Online payments are ready"} description={checkoutProblemCount ? "Payment pages, confirmed payments and automatic-renewal changes that need attention appear here." : "No online payment or automatic-renewal problems were found."} icon={checkoutProblemCount ? <CreditCard/> : <ShieldCheck/>} defaultOpen={sectionOpen("online-payment-problems", checkoutProblemCount > 0)}><div className="membership-queue-list">
      {!paymentConfigurationReady ? <article><div><strong>Online payments are not fully set up</strong><p>Ask the website administrator to finish the payment setup before accepting online membership payments.</p></div></article> : null}
      {checkoutProblems.map((problem) => <article key={problem.id}><div><strong>{problem.title}</strong><p>{problem.body}</p><small>Reported {new Date(problem.created_at).toLocaleString("en-GB")}</small><Link className="button outline" href={problem.action_href || "/admin/memberships?section=plans#plans"}>Review membership prices</Link></div></article>)}
      {(checkoutAttemptResult.data ?? []).map((problem) => <article key={problem.id}><div><strong>{problem.status === "payment_review" ? "Possible duplicate payment" : "Payment page could not be opened"}</strong><p>{problem.status === "payment_review" ? "The payment needs checking before membership can be updated." : "The member could not reach the payment page. Their membership and recorded payments are unchanged."}</p><small>Last updated {new Date(problem.updated_at).toLocaleString("en-GB")}</small>{problem.last_error ? <details><summary>Technical details</summary><small>{problem.last_error}</small></details> : null}</div></article>)}
      {(webhookFailureResult.data ?? []).map((problem) => <article key={problem.stripe_event_id}><div><strong>Confirmed payment could not be recorded</strong><p>The payment was confirmed, but membership has not been activated. Ask the website administrator to retry it.</p><details><summary>Technical details</summary><small>{problem.event_type} · {problem.last_error || "Retry required"}</small></details></div></article>)}
      {(providerCommandResult.data ?? []).map((problem) => <article key={problem.id}><div><strong>Automatic renewal could not be updated</strong><p>The requested change is waiting to be tried again.</p><details><summary>Technical details</summary><small>{problem.command_type.replaceAll("_", " ")} · {problem.attempts} attempt{problem.attempts === 1 ? "" : "s"} · {problem.last_error || "Waiting to retry"}</small></details></div></article>)}
      {!checkoutProblemCount ? <div className="membership-empty-state"><ShieldCheck/><strong>Online payments are ready</strong><p>No officer action is needed.</p></div> : null}
    </div></MembershipAdminSection>

    {(pendingOfflineResult.data ?? []).length ? <MembershipAdminSection id="pending-payments" visible={sectionVisible("pending-payments")} eyebrow="Renewal payments" title="Renewal payments waiting" description="Open a task after the member’s full cash, bank-transfer or cheque payment has arrived." icon={<Banknote/>} defaultOpen={sectionOpen("pending-payments")}><div className="membership-queue-list">{pendingOfflineResult.data?.map((term) => <article className={styles.taskCard} key={term.id}><div className={styles.taskSummary}><div className={styles.taskHeading}><strong>{memberMap.get(term.member_id)?.full_name || "Member"}</strong><span className={styles.statusBadge}>Awaiting payment</span></div><span>{term.membership_year} membership · {paymentMethodName(term.expected_payment_method)}</span><small>Amount due: {money(term.amount_due_pence)}</small></div><details className={styles.taskDisclosure}><summary><span>Record renewal payment<small>Open when the full amount has arrived</small></span><ChevronDown aria-hidden="true"/></summary><form action={confirmExistingMemberOfflineRenewal} className="stack-form"><input type="hidden" name="member_id" value={term.member_id}/><input type="hidden" name="membership_year" value={term.membership_year}/><input type="hidden" name="payment_method" value={term.expected_payment_method || "cash"}/><label>Receipt or payment reference<input name="payment_reference" required minLength={2} maxLength={120}/></label><label>Date received<input type="date" name="received_on" defaultValue={today} required/></label>{term.expected_payment_method === "cheque" ? <label className="checkbox-row"><input type="checkbox" name="cleared" required/>Cheque cleared</label> : null}<PendingSubmitButton pendingLabel="Activating…">Mark paid and activate</PendingSubmitButton></form></details></article>)}</div></MembershipAdminSection> : null}

    <MembershipAdminSection id="add-member" visible={sectionVisible("add-member")} eyebrow="Add a member" title="Create a membership manually" description="Add someone who applied in person or cannot use the online application. Their membership type and amount due are calculated from their date of birth and start date." icon={<UserPlus/>} defaultOpen={sectionOpen("add-member")}>
      <form action={createOfficerManagedMembership} className="editor-form membership-manual-create-form">
      <div className="membership-form-block"><div className="membership-form-block-heading"><span>1</span><div><h3>About the member</h3><p>Enter their name and the date their membership should begin.</p></div></div>
        <div className="form-grid"><label>Full name<input name="full_name" required/></label><label>Title <em>Optional</em><input name="title" maxLength={10}/></label></div>
        <OfficerMembershipEligibilityFields today={today} plans={plans.filter((plan) => plan.active).map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name, minimum_age: plan.minimum_age, maximum_age: plan.maximum_age }))} prices={prices.map((price) => ({ plan_id: price.plan_id, membership_year: price.membership_year, amount_pence: price.amount_pence }))}/>
      </div>
      <div className="membership-form-block"><div className="membership-form-block-heading"><span>2</span><div><h3>Contact details</h3><p>Add the details available. Email is optional for a membership created by an officer.</p></div></div>
        <div className="form-grid"><label>Email address <em>Optional</em><input type="email" name="contact_email"/></label><label>Telephone number <em>Optional</em><input name="contact_number"/></label></div>
        <fieldset className="wide settings-fieldset"><legend>Postal address <span>optional</span></legend><div className="settings-field-grid"><label>Address line 1<input name="address_line_one"/></label><label>Address line 2<input name="address_line_two"/></label><label>Town or city<input name="city"/></label><label>Postcode<input name="postcode"/></label></div></fieldset>
      </div>
      <div className="membership-form-block"><div className="membership-form-block-heading"><span>3</span><div><h3>Guardian details</h3><p>Complete this section only for a junior member.</p></div></div>
        <fieldset className="wide settings-fieldset"><legend>Junior member’s guardian</legend><p className="form-help">Record how the guardian agreed to the membership. Their email address is optional when an officer adds the member.</p><div className="settings-field-grid"><label>Guardian’s name<input name="guardian_name"/></label><label>Guardian’s email <em>Optional</em><input type="email" name="guardian_email"/></label><label className="wide">How consent was given<textarea name="guardian_consent_note" rows={2} placeholder="For example: signed paper form witnessed on 20 August 2026."/></label></div></fieldset>
      </div>
      <div className="membership-form-block"><div className="membership-form-block-heading"><span>4</span><div><h3>Payment</h3><p>Leave the payment box clear if the full amount has not arrived.</p></div></div>
        <div className="form-grid"><label>Payment method<select name="payment_method"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label><label>Receipt or payment reference<input name="payment_reference"/></label></div>
        <div className="membership-manual-checks"><label className="checkbox-row"><input type="checkbox" name="payment_received"/>Payment received in full</label><label className="checkbox-row"><input type="checkbox" name="cleared"/>Cheque cleared <em>Cheque payments only</em></label></div>
        <label>Reason for adding a possible duplicate <em>Complete only when a matching person is found</em><textarea name="duplicate_override_reason" rows={2} minLength={5} maxLength={500}/></label>
      </div>
      <div className="membership-form-submit"><p>Membership becomes active after full payment is recorded. Unpaid memberships appear in the payment list.</p><PendingSubmitButton className="button dark" pendingLabel="Adding member…">Add member</PendingSubmitButton></div>
      </form>
    </MembershipAdminSection>

    {(paymentReviewResult.data ?? []).length ? <MembershipAdminSection id="payment-reviews" visible={sectionVisible("payment-reviews")} className="membership-attention-section" eyebrow="Payment needs attention" title="Refunds and disputed payments" description="Access remains available until a decision is recorded." icon={<ShieldCheck/>} defaultOpen={sectionOpen("payment-reviews", true)}><div className="membership-queue-list">{paymentReviewResult.data?.map((term) => <article key={term.id}><div><strong>{memberMap.get(term.member_id)?.full_name || "Member"}</strong><span>{term.membership_year} · Paid {money(term.amount_paid_pence)} of {money(term.amount_due_pence)}</span><small>A full refund or disputed payment was reported. Any refund must be issued through the online payment service.</small><Link href={`/admin/memberships?member=${term.member_id}&section=member-history#member-history`}>View membership and payment history</Link></div><form action={resolveMembershipPaymentReview} className="stack-form"><input type="hidden" name="term_id" value={term.id}/><label>Decision<select name="resolution"><option value="retain">Keep the membership active</option><option value="replace">Ask for another payment</option><option value="lapse">End the membership</option></select></label><label>Reason for the decision<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></form></article>)}</div></MembershipAdminSection> : null}

    {(studentRequestResult.data ?? []).length ? <MembershipAdminSection id="student-requests" visible={sectionVisible("student-requests")} className="membership-attention-section" eyebrow="Decision needed before payment" title="Student membership requests" description="Confirm or decline each request before the member can pay the renewal fee." icon={<UserCheck/>} defaultOpen={sectionOpen("student-requests", true)}><div className="membership-queue-list">{studentRequestResult.data?.map((transition) => <article key={transition.id}><div><strong>{memberMap.get(transition.member_id)?.full_name || "Member"}</strong><span>Student membership requested for {transition.membership_year}</span><small>Adult membership remains selected until this request is approved.</small></div><div className="membership-queue-actions"><form action={reviewStudentMembershipRequest} className="stack-form"><input type="hidden" name="transition_id" value={transition.id}/><input type="hidden" name="decision" value="approve"/><label>Reason for approval<input name="reason" minLength={5} maxLength={500} defaultValue="Student declaration reviewed by a membership officer." required/></label><PendingSubmitButton pendingLabel="Approving…">Approve Student membership</PendingSubmitButton></form><form action={reviewStudentMembershipRequest} className="stack-form"><input type="hidden" name="transition_id" value={transition.id}/><input type="hidden" name="decision" value="reject"/><label>Reason for declining<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Declining…">Keep Adult membership</PendingSubmitButton></form></div></article>)}</div></MembershipAdminSection> : null}

    {(honoraryConflictResult.data ?? []).length ? <MembershipAdminSection id="honorary-conflicts" visible={sectionVisible("honorary-conflicts")} className="membership-attention-section" eyebrow="Payment already recorded" title="Honorary membership payment checks" description="Review payments taken for a year that will be covered by honorary membership. Refunds are never issued automatically." icon={<Award/>} defaultOpen={sectionOpen("honorary-conflicts", true)}><div className="membership-queue-list">{honoraryConflictResult.data?.map((conflict) => <article key={conflict.id}><div><strong>{conflict.member_id ? memberMap.get(conflict.member_id)?.full_name || "Member" : "Member"}</strong><p>{conflict.body}</p>{conflict.member_id ? <Link href={`/admin/memberships?member=${conflict.member_id}&section=member-history#member-history`}>View payment history</Link> : null}</div>{conflict.member_id ? <form action={resolveHonoraryPaymentConflict} className="stack-form"><input type="hidden" name="member_id" value={conflict.member_id}/><label>Decision<select name="decision"><option value="retain">Keep the payment on record; no refund</option><option value="handled-in-stripe">Payment handled through the online payment service</option></select></label><label>Reason for the decision<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save decision</PendingSubmitButton></form> : null}</article>)}</div></MembershipAdminSection> : null}

    {manualContactTasks.length ? <MembershipAdminSection id="manual-contact" visible={sectionVisible("manual-contact")} eyebrow="Personal contact needed" title="Members to contact" description="Each person appears once, even when several updates need to be shared with them." icon={<BellRing/>} defaultOpen={sectionOpen("manual-contact")}><div className="membership-queue-list">{manualContactTasks.map((task) => <article key={task.member_id}><div><strong>{task.member_id ? memberMap.get(task.member_id)?.full_name || "Member" : "Member"}</strong><p>{task.body}</p>{task.member_id ? <Link href={`/admin/memberships?member=${task.member_id}&section=member-history#member-history`}>View membership history</Link> : null}</div><form action={completeManualMembershipContact} className="stack-form"><input type="hidden" name="notification_id" value={task.id}/><label>Contact note<textarea name="reason" minLength={5} maxLength={500} placeholder="For example: phoned on 20 August and spoke to the member." required/></label><PendingSubmitButton pendingLabel="Saving…">Mark all updates as contacted</PendingSubmitButton></form></article>)}</div></MembershipAdminSection> : null}

    <MembershipAdminSection id="renewals" visible={sectionVisible("renewals")} eyebrow="Renew a member" title="Record a renewal payment" description="Record a full payment made by cash, bank transfer or cheque. The exact amount is shown before saving, and automatic online renewal is switched off to prevent a second charge." icon={<Landmark/>} defaultOpen={sectionOpen("renewals")}><OfficerRenewalPaymentForm members={renewableMembers.map((member) => ({ id: member.id, full_name: member.full_name, state_label: memberStateName(member.effective_state) }))} choices={renewalChoices} currentYear={currentYear} today={today}/></MembershipAdminSection>

    {selectedMemberId ? <MembershipAdminSection id="member-history" visible={sectionVisible("member-history")} className="membership-member-history" eyebrow="Member history" title={memberMap.get(selectedMemberId)?.full_name || "Member"} description="Review contact ownership, portal access, eligibility, memberships and payments." icon={<CreditCard/>} defaultOpen={sectionOpen("member-history", true)}>
      <div className="membership-admin-grid">
        <form action={requestMemberContactChange} className="editor-form"><input type="hidden" name="member_id" value={selectedMemberId}/><h3>Correspondence details</h3><p className="form-help">A changed email address is used only after the mailbox confirms it. Shared addresses are allowed.</p><label>Email address <em>Leave empty to remove</em><input type="email" name="contact_email" defaultValue={memberMap.get(selectedMemberId)?.contact_email || ""}/></label><label>Whose address is this?<select name="contact_role" defaultValue={memberMap.get(selectedMemberId)?.contact_role || "self"}><option value="self">The member’s own</option><option value="guardian">Guardian correspondence</option><option value="shared_household">Shared household correspondence</option></select></label><label>Reason for the change<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Sending confirmation…">Save and verify correspondence</PendingSubmitButton></form>
        <div className="editor-form"><h3>Personal website login</h3><p className="form-help">A shared contact address never gives one person access to another person’s membership. Each member with website access needs a unique login email.</p>{memberMap.get(selectedMemberId)?.auth_user_id ? <form action={removeMemberPortalLogin} className="stack-form"><input type="hidden" name="member_id" value={selectedMemberId}/><label>Reason for removing access<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Removing…">Remove personal website access</PendingSubmitButton></form> : <form action={assignMemberPortalLogin} className="stack-form"><input type="hidden" name="member_id" value={selectedMemberId}/><label>Unique login email<input type="email" name="login_email" required/></label><label>Reason for assigning this login<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Assigning…">Assign or invite website login</PendingSubmitButton></form>}</div>
      </div>
      <form action={correctMemberEligibility} className="editor-form"><input type="hidden" name="member_id" value={selectedMemberId}/><h3>Correct the date of birth</h3><p className="form-help">Use this only when the saved date is wrong. The reason is kept in the member’s history.</p><label>Date of birth<input type="date" name="date_of_birth" defaultValue={memberMap.get(selectedMemberId)?.date_of_birth || ""} required/></label><label>Reason for the change<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving…">Save corrected date</PendingSubmitButton></form><div className="membership-queue-list">{(historyTermsResult.data ?? []).map((term) => <article key={term.id}><div><strong>{term.membership_year} · {memberStateName(term.status)}</strong><span>{term.amount_paid_pence === term.amount_due_pence ? money(term.amount_paid_pence) : `${money(term.amount_paid_pence)} paid of ${money(term.amount_due_pence)}`}</span><small>{term.starts_on} to {term.ends_on}</small></div><div>{(historyPaymentsResult.data ?? []).filter((payment) => payment.term_id === term.id).map((payment) => { const actor = Array.isArray(payment.administrative_actors) ? payment.administrative_actors[0] : payment.administrative_actors; return <div key={payment.id}><p>{paymentMethodName(payment.method)} · {payment.status.replaceAll("_", " ")} · {money(payment.amount_pence)}{payment.refunded_pence ? ` · ${money(payment.refunded_pence)} refunded` : ""}{payment.offline_reference ? ` · reference ${payment.offline_reference}` : ""}{actor ? ` · recorded by ${actor.display_name} (${actor.reference_code})` : ""}</p>{payment.method !== "stripe" && payment.status === "paid" ? <details><summary>Report a returned or reversed payment</summary><form action={reportOfflineMembershipPaymentFailure} className="stack-form"><input type="hidden" name="payment_id" value={payment.id}/><label>What happened?<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="danger-button" pendingLabel="Saving…">Send payment for checking</PendingSubmitButton></form></details> : null}</div>; })}</div></article>)}{(historyHonoraryResult.data ?? []).map((honorary) => <article key={honorary.id}><div><strong>Lifetime honorary · {honorary.status}</strong><span>Starts {honorary.effective_from}{honorary.revoked_effective_on ? ` · changes ${honorary.revoked_effective_on}` : ""}</span><small>{honorary.reason}{honorary.revocation_reason ? ` · ${honorary.revocation_reason}` : ""}</small></div></article>)}{!(historyTermsResult.data?.length || historyHonoraryResult.data?.length) ? <div className="membership-empty-state"><CreditCard/><strong>No history yet</strong><p>No membership or payment history has been recorded.</p></div> : null}</div>
    </MembershipAdminSection> : null}


    {deliveryProblemCount ? <MembershipAdminSection id="email-failures" visible={sectionVisible("email-failures")} className="membership-attention-section" eyebrow="Email needs attention" title="Emails that need checking" description="Correct an address, retry delivery, or contact the member another way when necessary." icon={<BellRing/>} defaultOpen={sectionOpen("email-failures")}><div className="membership-queue-list">{!emailConfigurationReady ? <article><div><strong>Membership emails are not fully set up</strong><p>Ask the website administrator to finish the email setup before launch.</p></div></article> : null}{(failureResult.data ?? []).map((failure) => <article key={failure.id}><div><strong>{failure.title}</strong><span>{failure.recipient_email} · {failure.email_attempts} attempts</span><small>The email could not be delivered.</small>{failure.last_email_error ? <details><summary>Technical details</summary><small>{failure.last_email_error}</small></details> : null}{failure.member_id ? <Link href={`/admin/memberships?member=${failure.member_id}&section=member-history#member-history`}>Correct this member’s contact details</Link> : null}</div><form action={retryMembershipNotification}><input type="hidden" name="notification_id" value={failure.id}/><PendingSubmitButton pendingLabel="Requesting retry…">Retry email</PendingSubmitButton></form></article>)}{(deliveryProblemResult.data ?? []).map((failure) => <article key={failure.id}><div><strong>{failure.event_type === "bounced" ? "Email address could not receive messages" : failure.event_type === "complained" ? "Recipient reported unwanted email" : "Email delivery was stopped"}</strong><p>{failure.event_type === "bounced" ? "The address could not receive this email." : failure.event_type === "complained" ? "The recipient marked a membership email as unwanted." : "The email service has stopped sending to this address."}</p><small>{new Date(failure.occurred_at).toLocaleString("en-GB")}</small></div></article>)}</div></MembershipAdminSection> : null}

    <MembershipAdminSection id="honorary" visible={sectionVisible("honorary")} eyebrow="Occasional task" title="Lifetime honorary membership" description="Grant or end payment-free lifetime membership. Every change requires a reason and is kept in the member’s history." icon={<Award/>} defaultOpen={sectionOpen("honorary")}><div className="membership-admin-grid"><form action={grantHonoraryMembership} className="editor-form"><h3>Make an existing member honorary</h3><label>Member<select name="member_id" required>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {memberStateName(member.effective_state)}</option>)}</select></label><label>Start date<input name="effective_from" type="date" min={today} defaultValue={nextYearStart} required/></label><label>Reason for honorary membership<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="button dark" pendingLabel="Scheduling…">Schedule honorary membership</PendingSubmitButton></form><form action={createHonoraryMember} className="editor-form"><h3>Add a new honorary member</h3><label>Full name<input name="full_name" required/></label><label>Email address <em>Optional</em><input name="contact_email" type="email"/></label><label>Telephone number <em>Optional</em><input name="contact_number"/></label><label>Start date<input name="effective_from" type="date" min={today} defaultValue={nextYearStart} required/></label><label>Reason for honorary membership<textarea name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton className="button dark" pendingLabel="Adding…">Add honorary member</PendingSubmitButton></form></div><div className="membership-queue-list">{(honoraryResult.data ?? []).map((honorary) => <article key={honorary.id}><div><strong>{memberMap.get(honorary.member_id)?.full_name || "Former member"}</strong><span>{honorary.status === "active" ? "Active" : "Scheduled"} from {new Date(`${honorary.effective_from}T12:00:00Z`).toLocaleDateString("en-GB")}</span><small>{honorary.reason}</small></div>{!honorary.revoked_effective_on ? <form action={revokeHonoraryMembership} className="stack-form"><input type="hidden" name="honorary_id" value={honorary.id}/><label>Membership after honorary status<select name="replacement_plan_id" required>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>Change date<input name="effective_on" type="date" min={today} defaultValue={nextYearStart} required/></label><label>Reason for ending honorary membership<input name="reason" minLength={5} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Scheduling…">Schedule the change</PendingSubmitButton></form> : null}</article>)}</div></MembershipAdminSection>

    <MembershipAdminSection id="plans" visible={sectionVisible("plans")} eyebrow="Occasional task" title="Membership types and annual fees" description="The current fee continues automatically each year. Add a fee change only when the amount needs to change." icon={<ShieldCheck/>} defaultOpen={sectionOpen("plans")}><div className="membership-plan-admin-grid">{plans.map((plan) => {
      const planPrices = prices.filter((item) => item.plan_id === plan.id);
      const latestPrice = planPrices[0];
      const onlineSetupNeeded = planPrices.some((item) => !item.stripe_price_id);
      return <article className="membership-plan-card" key={plan.id}>
        <header className="membership-plan-card-header">
          <div><h3>{plan.name}</h3><p>{plan.minimum_age}–{plan.maximum_age} years · {plan.requires_approval ? "Officer approval required" : "No officer approval"}</p></div>
          <span className={plan.active ? "is-ready" : "is-inactive"}>{plan.active ? "Available" : "Hidden"}</span>
        </header>
        <div className="membership-plan-card-summary">
          <div className="membership-plan-summary-heading"><div><h4>Annual fees</h4><p>The latest fee remains in force until a change starts.</p></div>{planPrices.length ? <span className={onlineSetupNeeded ? "needs-setup" : "is-ready"}>{onlineSetupNeeded ? "Setup needed" : "Online ready"}</span> : null}</div>
          {planPrices.length ? <div className="membership-plan-fee-list">{planPrices.map((price) => <div className="membership-plan-fee-row" key={price.id}><span>{price.membership_year}</span><strong>{money(price.amount_pence)}</strong><small className={price.stripe_price_id ? "is-ready" : "needs-setup"}>{price.stripe_price_id ? price.carried_forward_from_id ? "Continued" : "Officer set" : "Needs setup"}</small></div>)}</div> : <p className="membership-plan-no-fee">No annual fee has been set.</p>}
        </div>
        <form action={configureMembershipPrice} className="editor-form membership-price-form"><h4>Change the annual fee</h4><input type="hidden" name="plan_id" value={plan.id}/><div className="form-grid"><label>Change starts in<input name="membership_year" type="number" min={new Date().getUTCFullYear()} defaultValue={new Date().getUTCFullYear() + 1} required/></label><label>New annual fee (£)<input name="amount" type="number" min="1" max="10000" step="0.01" defaultValue={latestPrice ? latestPrice.amount_pence / 100 : ""} required/></label></div><small>Use this only when the amount changes. The existing fee continues automatically until this membership year begins. Previous fees and payments remain unchanged.</small><PendingSubmitButton className="button dark" pendingLabel="Saving change…">Save fee change</PendingSubmitButton></form>
        <details className="membership-plan-settings">
          <summary><span><strong>Edit membership details</strong><small>Age limits, approval and availability</small></span><ChevronDown aria-hidden="true"/></summary>
          <form action={updateMembershipPlan} className="editor-form"><input type="hidden" name="plan_id" value={plan.id}/><label>Description<textarea name="description" defaultValue={plan.description} required/></label><div className="form-grid"><label>Youngest age<input name="minimum_age" type="number" min="0" max="120" defaultValue={plan.minimum_age} required/></label><label>Oldest age<input name="maximum_age" type="number" min="0" max="120" defaultValue={plan.maximum_age} required/></label></div><label className="checkbox-row"><input type="checkbox" name="requires_approval" defaultChecked={plan.requires_approval}/>Require officer approval for applications</label><label className="checkbox-row"><input type="checkbox" name="active" defaultChecked={plan.active}/>Show this membership type on the application form</label><PendingSubmitButton className="button outline" pendingLabel="Saving…">Save membership details</PendingSubmitButton></form>
        </details>
      </article>;
    })}</div></MembershipAdminSection>

    <MembershipAdminSection id="reports" visible={sectionVisible("reports")} eyebrow="Bookkeeping and records" title="Membership reports" description="Reports are prepared in the background and remain available for 24 hours. Each download includes the membership records, a summary and financial totals." icon={<Download/>} defaultOpen={sectionOpen("reports")}><div className="membership-queue-list">{(reportExports ?? []).map((report) => <article key={report.id}><div><strong>{report.status === "ready" ? "Complete membership records" : report.status === "failed" ? "Report needs retrying" : "Report is being prepared"}</strong><span>Requested {new Date(report.created_at).toLocaleString("en-GB")}</span><small>{report.status === "ready" ? `Ready until ${new Date(report.expires_at!).toLocaleString("en-GB")}` : report.last_error || "Large registers may take a few minutes."}</small></div>{report.status === "ready" ? <Link className="button outline" href={`/admin/memberships/export?id=${report.id}`}>Download records</Link> : null}</article>)}{!reportExports?.length ? <div className="membership-empty-state"><Download/><strong>No reports prepared yet</strong><p>Use “Prepare records download” above when bookkeeping or legal records are needed.</p></div> : null}</div></MembershipAdminSection>

    <MembershipAdminSection id="membermojo-import" visible={sectionVisible("membermojo-import")} className="membership-import-section" eyebrow="One-time import" title="Import the final MemberMojo list" description="Run this once after the final MemberMojo export. Existing people are not added twice, and uncertain records are listed for review." icon={<UsersRound/>} defaultOpen={sectionOpen("membermojo-import")}><form action={stageMemberMojoCutover}><PendingSubmitButton className="button outline" pendingLabel="Preparing import…">Prepare final import</PendingSubmitButton></form>{reviewResult.data?.length ? <div className="membership-queue-list">{reviewResult.data.map((review) => <article key={review.id}><div><strong>{reviewKindName(review.review_kind)}</strong><p>{review.summary}</p><small>MemberMojo record {review.membership_record_id}</small>{review.review_kind === "shared_email" || review.review_kind === "portal_conflict" ? <p className="form-help">Confirm a unique personal login in the member history, or record that this person will receive membership emails without having an online account.</p> : null}</div><form action={resolveMembershipMigrationReview} className="stack-form"><input type="hidden" name="review_id" value={review.id}/><label>Decision<select name="status"><option value="resolved">Reviewed and resolved</option><option value="dismissed">Not a genuine conflict</option></select></label><label>What was decided?<textarea name="resolution" minLength={8} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving review…">Save review decision</PendingSubmitButton></form></article>)}</div> : <p className="membership-section-note">There are no imported records waiting for review.</p>}</MembershipAdminSection>
  </div>;
}
