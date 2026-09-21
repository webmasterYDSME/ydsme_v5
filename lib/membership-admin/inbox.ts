import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { money, timestampDateLabel, waitingLabel } from "@/lib/membership-admin/format";
import { MEMBER_REVIEW_KINDS } from "@/lib/membership-admin/review-notices";
import { countRetentionWaitingForSwitch } from "@/lib/membership-admin/retention";
import { londonDateParts } from "@/lib/membership-rules";
import { DUPLICATE_PAYMENT_REASON, isUnappliedPayment, unappliedPaymentReason } from "@/lib/membership-admin/unapplied-payment";

type Admin = ReturnType<typeof createServiceClient>;

/**
 * The Inbox is the single list of everything a membership officer has to act on. The task filters
 * below are the only place the rules live, and both the list and the count in the navigation are
 * built from them, so the badge always matches what the Inbox shows.
 */
export type InboxKind = "payment" | "verify" | "request" | "contact" | "problem";

export const inboxKinds: { key: InboxKind; label: string }[] = [
  { key: "payment", label: "Payments" },
  { key: "verify", label: "To verify" },
  { key: "request", label: "Requests" },
  { key: "contact", label: "To contact" },
  { key: "problem", label: "Problems" },
];

export const kindPillLabel: Record<InboxKind, string> = {
  payment: "Payment", verify: "To verify", request: "Request", contact: "Contact", problem: "Problem",
};

type Base = {
  /** Stable, URL-safe identity used by ?task= to open the task's panel. */
  key: string;
  kind: InboxKind;
  name: string;
  summary: string;
  /** When the task appeared, or null for setup problems that outrank everything else. */
  since: string | null;
  waiting: string;
  cta: string;
  memberId: string | null;
};

/** What the officer needs to see about the money behind a paid membership that is waiting for its eligibility check. */
export type VerificationPayment = {
  method: string | null;
  /** paid, pending, refunded, partially_refunded, disputed and so on, as stored on the payment. */
  status: string;
  amountPence: number | null;
  refundedPence: number;
  year: number | null;
  reference: string | null;
  receivedOn: string | null;
  clearedOn: string | null;
  stripe: { paymentIntent: string | null; checkoutSession: string | null; invoice: string | null; dashboardUrl: string | null } | null;
};

export type InboxTask = Base & (
  | { type: "application-payment"; application: { id: string; full_name: string; contact_email: string | null; date_of_birth: string; payment_method: string | null; status: string; guardian_name: string | null; guardian_led: boolean }; planName: string; amountDuePence: number | null; received: { payment_reference: string | null; received_on: string | null } | null }
  | { type: "renewal-payment"; termId: string; year: number; amountDuePence: number; method: string | null }
  | { type: "verification"; planName: string; application: { id: string; full_name: string; contact_email: string | null; contact_number: string | null; guardian_led: boolean; student_declaration: boolean; date_of_birth: string | null; applied_at: string | null; guardian_name: string | null; guardian_email: string | null; guardian_contact_number: string | null; guardian_consent_version: string | null; guardian_verified_at: string | null }; payment: VerificationPayment | null }
  | { type: "student-request"; transitionId: string; year: number }
  | { type: "manual-contact"; notificationId: string; items: string[] }
  | { type: "payment-review"; termId: string; year: number; paidPence: number; duePence: number }
  | { type: "honorary-conflict"; body: string }
  | { type: "member-review"; notificationId: string; title: string; body: string }
  | { type: "refund"; applicationId: string; reason: string | null; outstandingPence: number }
  | { type: "unapplied-payment"; attemptId: string; duplicate: boolean; paymentIntent: string | null; dashboardUrl: string | null; reason: string; amountPence: number | null; year: number | null; technical: string | null }
  | { type: "email-delivery"; eventId: string; recipient: string | null; event: "bounced" | "complained" | "suppressed"; subject: string | null }
  | { type: "email-retry"; notificationId: string; recipient: string; attempts: number; error: string | null }
  | { type: "notice"; area: "Online payments" | "Email" | "Setup"; title: string; body: string; technical: string | null; href: string | null; hrefLabel: string | null }
);

const APPLICATION_WAITING = ["awaiting_approval", "awaiting_cash", "awaiting_bank_transfer", "awaiting_cheque"];
const LIMIT = { checkoutAttempts: 100, webhookFailures: 100, providerCommands: 100, emailFailures: 50, deliveryEvents: 100 };
const HEAD = { count: "exact", head: true } as const;

/** When the daily membership job last finished, if it has run before but has been quiet for three days. */
async function staleDailyRun(admin: Admin): Promise<string | null> {
  const { data, error } = await admin.from("membership_daily_runs").select("completed_at").order("run_date", { ascending: false }).limit(1).maybeSingle();
  if (error || !data?.completed_at) return null;
  return Date.now() - new Date(data.completed_at).getTime() > 3 * 24 * 60 * 60 * 1000 ? data.completed_at : null;
}

/** The renewal year that members should be getting invitations for about now but that has not been opened, if any. */
async function unopenedRenewalYear(admin: Admin): Promise<number | null> {
  const { year, month, day } = londonDateParts(new Date());
  if (!((month === 11 && day >= 20) || month === 12 || month <= 2)) return null;
  const target = month >= 11 ? year + 1 : year;
  const { data, error } = await admin.from("membership_renewal_campaigns").select("open").eq("membership_year", target).maybeSingle();
  if (error) return null;
  return data?.open ? null : target;
}

function sources(admin: Admin) {
  const notifications = () => admin.from("membership_notifications");
  return {
    applications: (columns: string, options?: typeof HEAD) => admin.from("membership_applications").select(columns, options).in("status", APPLICATION_WAITING),
    renewalPayments: (columns: string, options?: typeof HEAD) => admin.from("membership_terms").select(columns, options).eq("status", "scheduled").not("expected_payment_method", "is", null),
    verifications: (columns: string, options?: typeof HEAD) => admin.from("membership_applications").select(columns, options).eq("status", "converted").eq("manual_verification", "pending"),
    deniedVerifications: (columns: string) => admin.from("membership_applications").select(columns).eq("manual_verification", "denied"),
    studentRequests: (columns: string, options?: typeof HEAD) => admin.from("membership_plan_transitions").select(columns, options).eq("status", "awaiting_student_review"),
    manualContact: (columns: string) => notifications().select(columns).eq("kind", "membership.manual-contact-officer").is("read_at", null),
    paymentReviews: (columns: string, options?: typeof HEAD) => admin.from("membership_terms").select(columns, options).eq("status", "payment_review"),
    memberReviews: (columns: string) => notifications().select(columns).in("kind", MEMBER_REVIEW_KINDS).is("read_at", null),
    honoraryConflicts: (columns: string, options?: typeof HEAD) => notifications().select(columns, options).eq("kind", "membership.honorary-payment-review-officer").is("read_at", null),
    checkoutNotices: (columns: string, options?: typeof HEAD) => notifications().select(columns, options).eq("kind", "membership.application-payment-attention-officer").is("read_at", null),
    checkoutAttempts: (columns: string) => admin.from("membership_checkout_attempts").select(columns).in("status", ["failed", "payment_review"]).is("resolved_at", null).limit(LIMIT.checkoutAttempts),
    webhookFailures: (columns: string) => admin.from("stripe_webhook_events").select(columns).eq("processing_status", "failed").limit(LIMIT.webhookFailures),
    providerCommands: (columns: string) => admin.from("membership_provider_commands").select(columns).eq("status", "failed").limit(LIMIT.providerCommands),
    emailFailures: (columns: string) => notifications().select(columns).eq("email_status", "failed").limit(LIMIT.emailFailures),
    deliveryEvents: (columns: string) => admin.from("membership_delivery_events").select(columns).in("event_type", ["bounced", "complained", "suppressed"]).is("resolved_at", null).order("occurred_at").limit(LIMIT.deliveryEvents),
  };
}

export function configuration() {
  const local = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
  const localEmail = local.test(process.env.NEXT_PUBLIC_SITE_URL || "")
    && local.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    && Boolean(process.env.LOCAL_MAILPIT_URL);
  return {
    payments: Boolean((process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY)
      && (process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET)),
    email: Boolean(process.env.MEMBERSHIP_FROM_EMAIL
      && (localEmail || (process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET))),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function fail(what: string, error: unknown): never {
  if (error) console.error(`Membership inbox: ${what}`, error);
  throw new Error(`Unable to load ${what}.`);
}

const stripeDashboard = (path: string) => `https://dashboard.stripe.com${/^(sk|rk)_test_/.test(process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY || "") ? "/test" : ""}/${path}`;

/** Payment details for paid applications that still need an eligibility check, keyed by application. */
async function loadVerificationPayments(admin: Admin, applicationIds: string[]) {
  const result = new Map<string, VerificationPayment>();
  if (!applicationIds.length) return result;
  const [termResult, offlineResult] = await Promise.all([
    admin.from("membership_terms")
      .select("application_id,membership_year,amount_due_pence,amount_paid_pence,membership_payments(method,status,amount_pence,refunded_pence,stripe_checkout_session_id,stripe_payment_intent_id,stripe_invoice_id,cash_receipt_reference,received_at)")
      .in("application_id", applicationIds),
    admin.from("membership_offline_payment_records")
      .select("application_id,method,status,payment_reference,received_on,cleared_on")
      .in("application_id", applicationIds).in("status", ["received", "cleared"]),
  ]);
  if (termResult.error) fail("payment details", termResult.error);
  if (offlineResult.error) fail("offline payment details", offlineResult.error);
  const offline = new Map(((offlineResult.data ?? []) as Row[]).map((record) => [record.application_id as string, record]));
  for (const term of (termResult.data ?? []) as Row[]) {
    const payments = (term.membership_payments ?? []) as Row[];
    const payment = payments.find((row) => row.status !== "void" && row.status !== "failed") ?? payments[0] ?? null;
    const record = offline.get(term.application_id) ?? null;
    const method = payment?.method ?? record?.method ?? null;
    const hasStripe = Boolean(payment?.stripe_payment_intent_id || payment?.stripe_checkout_session_id || payment?.stripe_invoice_id);
    result.set(term.application_id, {
      method,
      status: payment?.status ?? (term.amount_paid_pence >= term.amount_due_pence && term.amount_due_pence > 0 ? "paid" : "unknown"),
      amountPence: payment?.amount_pence ?? (term.amount_paid_pence || null),
      refundedPence: payment?.refunded_pence ?? 0,
      year: term.membership_year ?? null,
      reference: record?.payment_reference ?? payment?.cash_receipt_reference ?? null,
      receivedOn: record?.received_on ?? (payment?.received_at ? String(payment.received_at).slice(0, 10) : null),
      clearedOn: record?.cleared_on ?? null,
      stripe: hasStripe ? {
        paymentIntent: payment.stripe_payment_intent_id ?? null,
        checkoutSession: payment.stripe_checkout_session_id ?? null,
        invoice: payment.stripe_invoice_id ?? null,
        dashboardUrl: payment.stripe_payment_intent_id ? stripeDashboard(`payments/${payment.stripe_payment_intent_id}`) : null,
      } : null,
    });
  }
  return result;
}

/** People whose membership was denied after payment, where money still has to be handed back. */
async function refundsToArrange(admin: Admin) {
  const { data: denied, error } = await sources(admin).deniedVerifications("id,full_name,converted_member_id,review_reason,created_at");
  if (error) fail("membership refunds", error);
  const applications = (denied ?? []) as Row[];
  if (!applications.length) return [];
  const { data: terms, error: termError } = await admin.from("membership_terms")
    .select("application_id,membership_payments(amount_pence,refunded_pence,status)")
    .in("application_id", applications.map((application) => application.id));
  if (termError) fail("membership refunds", termError);
  const outstanding = new Map<string, number>();
  for (const term of (terms ?? []) as Row[]) {
    // Only payments that actually hold money count; failed, cancelled and unpaid attempts owe nothing back.
    const sum = (term.membership_payments ?? [])
      .filter((payment: Row) => ["paid", "partially_refunded"].includes(payment.status))
      .reduce((total: number, payment: Row) => total + payment.amount_pence - payment.refunded_pence, 0);
    outstanding.set(term.application_id, (outstanding.get(term.application_id) ?? 0) + sum);
  }
  return applications
    .map((application) => ({ application, outstandingPence: outstanding.get(application.id) ?? 0 }))
    .filter((item) => item.outstandingPence > 0);
}

/** Each person appears once, whichever of their updates arrived last. */
// One task per person. Every officer gets a copy of each task, so identical texts are merged
// and what is left is the list of different things the member has to be told about.
function contactTasks(rows: Row[]) {
  const byMember = new Map<string, { row: Row; items: string[] }>();
  for (const row of rows) {
    if (!row.member_id) continue;
    const text = String(row.body ?? "");
    const group = byMember.get(row.member_id) ?? { row, items: [] };
    if (!group.items.includes(text)) group.items.push(text);
    byMember.set(row.member_id, group);
  }
  return Array.from(byMember.values());
}

/** Every officer gets their own copy of a review notice; the task appears once per person and kind. */
function onePerMemberAndKind(rows: Row[]) {
  return Array.from(new Map(rows.filter((row) => row.member_id).map((row) => [`${row.member_id}.${row.kind}`, row])).values());
}

function onePerMember(rows: Row[]) {
  return Array.from(new Map(rows.filter((row) => row.member_id).map((row) => [row.member_id as string, row])).values());
}

export const countInboxTasks = cache(async (): Promise<number> => {
  const admin = createServiceClient();
  const from = sources(admin);
  const head = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await query;
    if (error) fail("membership tasks", error);
    return count ?? 0;
  };
  const rows = async (query: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    const { data, error } = await query;
    if (error) fail("membership tasks", error);
    return data ?? [];
  };
  const [
    applications, renewals, verifications, students, contact, reviews, conflicts, checkoutNotices, memberReviewCount,
    attempts, webhooks, commands, emailFailures, deliveryEvents, refunds,
  ] = await Promise.all([
    head(from.applications("id", HEAD)), head(from.renewalPayments("id", HEAD)), head(from.verifications("id", HEAD)),
    head(from.studentRequests("id", HEAD)),
    rows(from.manualContact("id,member_id")).then((list) => onePerMember(list as Row[]).length),
    head(from.paymentReviews("id", HEAD)), head(from.honoraryConflicts("id", HEAD)), head(from.checkoutNotices("id", HEAD)),
    rows(from.memberReviews("id,member_id,kind")).then((list) => onePerMemberAndKind(list as Row[]).length),
    rows(from.checkoutAttempts("id")).then((list) => list.length),
    rows(from.webhookFailures("stripe_event_id")).then((list) => list.length),
    rows(from.providerCommands("id")).then((list) => list.length),
    rows(from.emailFailures("id")).then((list) => list.length),
    rows(from.deliveryEvents("id")).then((list) => list.length),
    refundsToArrange(admin).then((list) => list.length),
  ]);
  const ready = configuration();
  const stale = await staleDailyRun(admin);
  const unopened = await unopenedRenewalYear(admin);
  const retentionWaiting = await countRetentionWaitingForSwitch();
  return applications + renewals + verifications + students + contact + reviews + conflicts + checkoutNotices + memberReviewCount
    + attempts + webhooks + commands + emailFailures + deliveryEvents + refunds
    + Number(!ready.payments) + Number(!ready.email) + Number(Boolean(stale)) + Number(unopened !== null) + Number(retentionWaiting > 0);
});

export const loadInbox = cache(async (): Promise<{ tasks: InboxTask[] }> => {
  const admin = createServiceClient();
  const from = sources(admin);
  const [
    applicationResult, planResult, renewalResult, verificationResult, studentResult, contactResult, reviewResult,
    conflictResult, checkoutNoticeResult, memberReviewResult, attemptResult, webhookResult, commandResult, emailFailureResult, deliveryResult, refunds,
  ] = await Promise.all([
    from.applications("id,full_name,contact_email,date_of_birth,payment_method,status,guardian_name,guardian_led,created_at,requested_plan_id,membership_offline_payment_records(id,status,expected_amount_pence,payment_reference,received_on)"),
    admin.from("membership_plans").select("id,name"),
    from.renewalPayments("id,member_id,membership_year,amount_due_pence,expected_payment_method,created_at"),
    from.verifications("id,full_name,contact_email,contact_number,guardian_led,student_declaration,requested_plan_id,payment_method,guardian_name,guardian_email,guardian_contact_number,guardian_consent_version,guardian_verified_at,date_of_birth,created_at,converted_member_id"),
    from.studentRequests("id,member_id,membership_year,requested_at"),
    from.manualContact("id,member_id,body,created_at").order("created_at"),
    from.paymentReviews("id,member_id,membership_year,amount_due_pence,amount_paid_pence,updated_at"),
    from.honoraryConflicts("id,member_id,body,created_at").order("created_at"),
    from.checkoutNotices("id,title,body,action_href,created_at").order("created_at"),
    from.memberReviews("id,member_id,kind,title,body,created_at").order("created_at"),
    from.checkoutAttempts("id,status,last_error,updated_at,application_id,member_id,amount_pence,membership_year,stripe_payment_intent_id"),
    from.webhookFailures("stripe_event_id,event_type,last_error,claimed_at"),
    from.providerCommands("id,command_type,attempts,last_error,updated_at"),
    from.emailFailures("id,member_id,title,recipient_email,email_attempts,last_email_error,created_at"),
    from.deliveryEvents("id,event_type,occurred_at,membership_notifications(member_id,recipient_email,title)"),
    refundsToArrange(admin),
  ]);
  for (const [what, result] of [
    ["applications", applicationResult], ["membership types", planResult], ["renewal payments", renewalResult], ["verification work", verificationResult],
    ["student requests", studentResult], ["contact tasks", contactResult], ["payment reviews", reviewResult], ["honorary payment checks", conflictResult],
    ["online payment problems", checkoutNoticeResult], ["member review notices", memberReviewResult], ["online payment attempts", attemptResult], ["payment confirmations", webhookResult],
    ["automatic renewal changes", commandResult], ["email problems", emailFailureResult], ["email delivery problems", deliveryResult],
  ] as const) if (result.error) fail(what, result.error);

  const verificationPayments = await loadVerificationPayments(admin, ((verificationResult.data ?? []) as Row[]).map((row) => row.id));
  const contact = contactTasks((contactResult.data ?? []) as Row[]);
  const memberIds = Array.from(new Set([
    ...((renewalResult.data ?? []) as Row[]).map((row) => row.member_id),
    ...((studentResult.data ?? []) as Row[]).map((row) => row.member_id),
    ...contact.map(({ row }) => row.member_id),
    ...((reviewResult.data ?? []) as Row[]).map((row) => row.member_id),
    ...((conflictResult.data ?? []) as Row[]).map((row) => row.member_id),
    ...((attemptResult.data ?? []) as Row[]).map((row) => row.member_id),
    ...((memberReviewResult.data ?? []) as Row[]).map((row) => row.member_id),
  ].filter(Boolean)));
  const names = new Map<string, string>();
  if (memberIds.length) {
    const { data, error } = await admin.from("members").select("id,full_name").in("id", memberIds);
    if (error) fail("member names", error);
    for (const member of (data ?? []) as Row[]) names.set(member.id, member.full_name);
  }
  const memberName = (id: string | null) => (id ? names.get(id) : null) || "Member";
  // A card payment that could not be applied may belong to an application that has no member yet.
  const attemptApplicationIds = Array.from(new Set(((attemptResult.data ?? []) as Row[]).map((row) => row.application_id).filter(Boolean)));
  const applicationNames = new Map<string, string>();
  if (attemptApplicationIds.length) {
    const { data, error } = await admin.from("membership_applications").select("id,full_name").in("id", attemptApplicationIds);
    if (error) fail("application names", error);
    for (const application of (data ?? []) as Row[]) applicationNames.set(application.id, application.full_name);
  }
  const planName = new Map(((planResult.data ?? []) as Row[]).map((plan) => [plan.id, plan.name as string]));
  const tasks: InboxTask[] = [];
  const add = (task: Omit<Base, "waiting"> & Record<string, unknown>) => {
    tasks.push({ ...task, waiting: waitingLabel(task.since) } as InboxTask);
  };
  const methodWord = (method: string | null) => ({ cash: "cash", bank_transfer: "bank transfer", cheque: "cheque" } as Record<string, string>)[method || ""] || "payment";

  const ready = configuration();
  const staleRun = await staleDailyRun(admin);
  if (staleRun) add({ key: "notice.daily-run-stale", type: "notice", kind: "problem", name: "Daily membership updates have stopped", summary: `They last ran on ${timestampDateLabel(staleRun)}. Members are not being moved to grace or lapsed until they run again.`, since: staleRun, cta: "See details", memberId: null, area: "Setup", title: "Daily membership updates have stopped", body: `The daily job that moves members into their grace period and then lapses them last ran on ${timestampDateLabel(staleRun)}. Ask the website administrator to check it. When it runs again it catches up on the days it missed.`, technical: null, href: null, hrefLabel: null });
  const unopenedYear = await unopenedRenewalYear(admin);
  if (unopenedYear !== null) add({ key: "notice.renewals-not-open", type: "notice", kind: "problem", name: `Renewals for ${unopenedYear} are not open`, summary: "Members cannot renew online, and no one can be invited or reminded, until renewals are opened.", since: null, cta: "See details", memberId: null, area: "Setup", title: `Renewals for ${unopenedYear} are not open`, body: `Renewals for ${unopenedYear} have not been opened, so members cannot renew online and no invitations or reminders can be sent. Renewal emails are never sent automatically: open renewals on the Renewals tab, then send the invitations, and send a reminder whenever you want to chase members who have not paid.`, technical: null, href: "/admin/memberships/renewals", hrefLabel: "Open Renewals" });
  const retentionWaiting = await countRetentionWaitingForSwitch();
  if (retentionWaiting > 0) add({ key: "notice.retention-waiting", type: "notice", kind: "problem", name: "Old member records are past their date", summary: `${retentionWaiting} former ${retentionWaiting === 1 ? "member is" : "members are"} due for warning or removal. Check the list, then switch it on.`, since: null, cta: "See details", memberId: null, area: "Setup", title: "Old member records are past their date", body: `${retentionWaiting} former ${retentionWaiting === 1 ? "member is" : "members are"} past the date their details should be removed under the Privacy Policy. Nothing happens until an administrator has checked the list and switched on automatic removal.`, technical: null, href: "/admin/memberships/setup?tab=retention", hrefLabel: "Check the list" });
  if (!ready.payments) add({ key: "notice.payments-setup", type: "notice", kind: "problem", name: "Online payments are not fully set up", summary: "Ask the website administrator to finish the payment setup before accepting online payments.", since: null, cta: "See details", memberId: null, area: "Setup", title: "Online payments are not fully set up", body: "Ask the website administrator to finish the payment setup before accepting online membership payments.", technical: null, href: null, hrefLabel: null });
  if (!ready.email) add({ key: "notice.email-setup", type: "notice", kind: "problem", name: "Membership emails are not fully set up", summary: "Ask the website administrator to finish the email setup before launch.", since: null, cta: "See details", memberId: null, area: "Setup", title: "Membership emails are not fully set up", body: "Ask the website administrator to finish the email setup before launch.", technical: null, href: null, hrefLabel: null });

  for (const application of (applicationResult.data ?? []) as Row[]) {
    const received = ((application.membership_offline_payment_records ?? []) as Row[]).find((record) => record.status === "received") ?? null;
    const openRecord = ((application.membership_offline_payment_records ?? []) as Row[]).find((record) => record.status === "awaiting" || record.status === "received") ?? null;
    const legacy = application.status === "awaiting_approval";
    const plan = planName.get(application.requested_plan_id) || "Membership type not found";
    add({
      key: `application-payment.${application.id}`, type: "application-payment", kind: "payment", name: application.full_name,
      summary: legacy ? `${plan} · older application awaiting a decision` : `${plan} · ${methodWord(application.payment_method)}${received ? " · cheque received, not yet cleared" : " · awaiting payment"}`,
      since: application.created_at, cta: legacy ? "Review application" : received ? "Complete payment" : "Record payment", memberId: null,
      application: { id: application.id, full_name: application.full_name, contact_email: application.contact_email, date_of_birth: application.date_of_birth, payment_method: application.payment_method, status: application.status, guardian_name: application.guardian_name, guardian_led: Boolean(application.guardian_led) },
      planName: plan, amountDuePence: openRecord?.expected_amount_pence ?? null, received: received ? { payment_reference: received.payment_reference, received_on: received.received_on } : null,
    });
  }
  for (const term of (renewalResult.data ?? []) as Row[]) {
    add({
      key: `renewal-payment.${term.id}`, type: "renewal-payment", kind: "payment", name: memberName(term.member_id),
      summary: `Renewal ${term.membership_year} · ${methodWord(term.expected_payment_method)}`,
      since: term.created_at, cta: "Record payment", memberId: term.member_id,
      termId: term.id, year: term.membership_year, amountDuePence: term.amount_due_pence, method: term.expected_payment_method,
    });
  }
  for (const application of (verificationResult.data ?? []) as Row[]) {
    add({
      key: `verification.${application.id}`, type: "verification", kind: "verify", name: application.full_name,
      summary: application.guardian_name ? "Junior member · check eligibility and guardian consent" : "Active member · routine eligibility check",
      since: application.created_at, cta: "Verify", memberId: application.converted_member_id ?? null,
      planName: planName.get(application.requested_plan_id) || "Membership type not found",
      application: {
        id: application.id, full_name: application.full_name, contact_email: application.contact_email ?? null, contact_number: application.contact_number ?? null, guardian_led: Boolean(application.guardian_led),
        student_declaration: Boolean(application.student_declaration), date_of_birth: application.date_of_birth ?? null, applied_at: application.created_at ?? null,
        guardian_name: application.guardian_name, guardian_email: application.guardian_email, guardian_contact_number: application.guardian_contact_number,
        guardian_consent_version: application.guardian_consent_version, guardian_verified_at: application.guardian_verified_at,
      },
      payment: verificationPayments.get(application.id) ?? (application.payment_method ? { method: application.payment_method, status: "unknown", amountPence: null, refundedPence: 0, year: null, reference: null, receivedOn: null, clearedOn: null, stripe: null } : null),
    });
  }
  for (const transition of (studentResult.data ?? []) as Row[]) {
    add({
      key: `student-request.${transition.id}`, type: "student-request", kind: "request", name: memberName(transition.member_id),
      summary: `Student membership requested for ${transition.membership_year}`,
      since: transition.requested_at, cta: "Decide", memberId: transition.member_id,
      transitionId: transition.id, year: transition.membership_year,
    });
  }
  for (const { row: task, items } of contact) {
    const first = items[0].split("\n")[0];
    add({
      key: `manual-contact.${task.id}`, type: "manual-contact", kind: "contact", name: memberName(task.member_id),
      summary: (items.length > 1 ? `${first} and ${items.length - 1} more` : first).slice(0, 140),
      since: task.created_at, cta: "Log contact", memberId: task.member_id,
      notificationId: task.id, items,
    });
  }
  for (const term of (reviewResult.data ?? []) as Row[]) {
    add({
      key: `payment-review.${term.id}`, type: "payment-review", kind: "problem", name: memberName(term.member_id),
      summary: `Refund or disputed payment for ${term.membership_year} · access stays active until you decide`,
      since: term.updated_at, cta: "Decide", memberId: term.member_id,
      termId: term.id, year: term.membership_year, paidPence: term.amount_paid_pence, duePence: term.amount_due_pence,
    });
  }
  for (const notice of onePerMemberAndKind((memberReviewResult.data ?? []) as Row[])) {
    add({
      key: `member-review.${notice.member_id}.${notice.kind}`, type: "member-review", kind: "verify", name: memberName(notice.member_id),
      summary: notice.title, since: notice.created_at, cta: "Review", memberId: notice.member_id,
      notificationId: notice.id, title: notice.title, body: notice.body ?? "",
    });
  }
  for (const conflict of (conflictResult.data ?? []) as Row[]) {
    add({
      key: `honorary-conflict.${conflict.id}`, type: "honorary-conflict", kind: "problem", name: memberName(conflict.member_id),
      summary: "A payment was taken for a year honorary membership will cover", since: conflict.created_at, cta: "Decide",
      memberId: conflict.member_id, body: conflict.body ?? "",
    });
  }
  for (const { application, outstandingPence } of refunds) {
    add({
      key: `refund.${application.id}`, type: "refund", kind: "problem", name: application.full_name,
      summary: "Membership denied after payment · a refund has to be arranged manually", since: application.created_at, cta: "See details",
      memberId: application.converted_member_id, applicationId: application.id, reason: application.review_reason, outstandingPence,
    });
  }
  for (const notice of (checkoutNoticeResult.data ?? []) as Row[]) {
    add({
      key: `notice.checkout-${notice.id}`, type: "notice", kind: "problem", name: notice.title, summary: notice.body, since: notice.created_at, cta: "See details", memberId: null,
      area: "Online payments", title: notice.title, body: notice.body, technical: null,
      href: notice.action_href || "/admin/memberships/renewals", hrefLabel: "Review membership prices",
    });
  }
  for (const attempt of (attemptResult.data ?? []) as Row[]) {
    // A second card payment for someone already converted is stored as payment_review without the unapplied marker.
    const duplicate = attempt.status === "payment_review" && !isUnappliedPayment(attempt.last_error);
    if (isUnappliedPayment(attempt.last_error) || duplicate) {
      const who = (attempt.member_id ? names.get(attempt.member_id) : null) ?? (attempt.application_id ? applicationNames.get(attempt.application_id) : null) ?? "A member";
      add({
        key: `unapplied-payment.${attempt.id}`, type: "unapplied-payment", kind: "problem", name: who,
        summary: `${duplicate ? "Paid by card twice" : "Paid by card"}${attempt.amount_pence != null ? ` (${money(attempt.amount_pence)})` : ""}${duplicate ? " · the second payment needs refunding" : " · membership was not updated"}`,
        since: attempt.updated_at, cta: "See details", memberId: attempt.member_id ?? null,
        attemptId: attempt.id, duplicate, paymentIntent: attempt.stripe_payment_intent_id ?? null,
        dashboardUrl: attempt.stripe_payment_intent_id ? stripeDashboard(`payments/${attempt.stripe_payment_intent_id}`) : null, reason: duplicate ? DUPLICATE_PAYMENT_REASON : unappliedPaymentReason(attempt.last_error), amountPence: attempt.amount_pence ?? null,
        year: attempt.membership_year ?? null, technical: attempt.last_error,
      });
      continue;
    }
    const review = attempt.status === "payment_review";
    add({
      key: `notice.attempt-${attempt.id}`, type: "notice", kind: "problem", name: review ? "Possible duplicate payment" : "Payment page could not be opened",
      summary: review ? "The payment needs checking before membership can be updated." : "The member could not reach the payment page. Their membership and recorded payments are unchanged.",
      since: attempt.updated_at, cta: "See details", memberId: null, area: "Online payments",
      title: review ? "Possible duplicate payment" : "Payment page could not be opened",
      body: review ? "The payment needs checking before membership can be updated." : "The member could not reach the payment page. Their membership and recorded payments are unchanged.",
      technical: attempt.last_error ?? null, href: null, hrefLabel: null,
    });
  }
  for (const event of (webhookResult.data ?? []) as Row[]) {
    add({
      key: `notice.webhook-${event.stripe_event_id}`, type: "notice", kind: "problem", name: "Confirmed payment could not be recorded",
      summary: "The payment was confirmed, but membership has not been activated. Ask the website administrator to retry it.",
      since: event.claimed_at, cta: "See details", memberId: null, area: "Online payments", title: "Confirmed payment could not be recorded",
      body: "The payment was confirmed, but membership has not been activated. Ask the website administrator to retry it.",
      technical: `${event.event_type} · ${event.last_error || "Retry required"}`, href: null, hrefLabel: null,
    });
  }
  for (const command of (commandResult.data ?? []) as Row[]) {
    add({
      key: `notice.command-${command.id}`, type: "notice", kind: "problem", name: "Automatic renewal could not be updated",
      summary: "The requested change is waiting to be tried again.", since: command.updated_at, cta: "See details", memberId: null, area: "Online payments",
      title: "Automatic renewal could not be updated", body: "The requested change is waiting to be tried again.",
      technical: `${String(command.command_type).replaceAll("_", " ")} · ${command.attempts} attempt${command.attempts === 1 ? "" : "s"} · ${command.last_error || "Waiting to retry"}`, href: null, hrefLabel: null,
    });
  }
  for (const failure of (emailFailureResult.data ?? []) as Row[]) {
    add({
      key: `email-retry.${failure.id}`, type: "email-retry", kind: "problem", name: failure.title,
      summary: `${failure.recipient_email} · ${failure.email_attempts} attempts · the email could not be delivered`,
      since: failure.created_at, cta: "Retry or correct", memberId: failure.member_id,
      notificationId: failure.id, recipient: failure.recipient_email, attempts: failure.email_attempts, error: failure.last_email_error ?? null,
    });
  }
  for (const event of (deliveryResult.data ?? []) as Row[]) {
    const sent = Array.isArray(event.membership_notifications) ? event.membership_notifications[0] : event.membership_notifications;
    const recipient: string | null = sent?.recipient_email ?? null;
    const what = event.event_type === "bounced" ? "could not be delivered" : event.event_type === "complained" ? "was reported as unwanted" : "was stopped by the email service";
    add({
      key: `email-delivery.${event.id}`, type: "email-delivery", kind: "problem", name: recipient ? `Email to ${recipient} ${what}` : `An email ${what}`,
      summary: sent?.title ? `“${sent.title}”` : "A membership email", since: event.occurred_at, cta: "See details", memberId: sent?.member_id ?? null,
      eventId: event.id, recipient, event: event.event_type, subject: sent?.title ?? null,
    });
  }

  // Setup problems first, then oldest first, so nothing is left waiting behind newer work.
  tasks.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));
  return { tasks };
});
