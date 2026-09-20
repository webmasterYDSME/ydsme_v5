import Link from "next/link";
import { Mail, Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";
import { loadEmailQueueOverview } from "@/lib/email-queue";
import {
  QUEUE_CLASSES, QUEUE_STATUSES, bulkPerDay, classLabels, clearEstimateLabel, defaultQueueStatus, kindLabel, parseQueueClass,
  parseQueueStatus, queueRowActions, statusLabels, type QueueStatus,
} from "@/lib/email-queue-format";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalPagination } from "@/app/components/PortalPagination";
import {
  changeQueuedEmails, clearProviderPause, requeueFailedEmails, saveQueueSettings, setBulkPaused, stopWaitingBulkEmails,
} from "./actions";
import { QueueToolbar } from "./QueueToolbar";
import styles from "./email-queue.module.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
/** The database stops retrying an email after this many failed attempts. */
const MAX_ATTEMPTS = 5;
type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Row = {
  id: string;
  recipient_email: string;
  title: string;
  kind: string;
  delivery_class: "immediate" | "bulk";
  email_status: QueueStatus;
  email_attempts: number;
  last_email_error: string | null;
  requeue_count: number;
  created_at: string;
  email_sent_at: string | null;
  scheduled_for: string | null;
};

const when = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })
  : "";

/** Kept outside the page so the render itself stays pure. */
const inTheFuture = (value: string | null) => Boolean(value) && new Date(value as string).getTime() > Date.now();

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const statusPill: Record<QueueStatus, string> = {
  queued: styles.pillWait, sending: styles.pillSending, sent: styles.pillSent, failed: styles.pillFailed, cancelled: styles.pillStopped,
};

function flash(query: Query): { tone: "good" | "bad"; text: string } | null {
  const n = Number(one(query.n) ?? 0);
  const notice = one(query.notice);
  const error = one(query.error);
  if (error) {
    const text = {
      invalid: "That request was not understood.",
      "none-selected": "Tick at least one email first.",
      "settings-invalid": "Those settings do not work together. Check the numbers and try again.",
      failed: "That did not work. Try again.",
    }[error] ?? "That did not work. Try again.";
    return { tone: "bad", text };
  }
  const messages: Record<string, string> = {
    requeued: `${plural(n, "email")} put back in the queue.`,
    stopped: `${plural(n, "email")} stopped. They will not be sent unless you put them back.`,
    paused: "Queued mail is paused. Immediate mail such as tickets and sign-up codes still goes out.",
    resumed: "Queued mail is sending again.",
    "pause-cleared": "The email provider pause has been cleared.",
    "settings-saved": "Settings saved.",
  };
  return notice && messages[notice] ? { tone: "good", text: messages[notice] } : null;
}

export default async function EmailQueuePage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query] = await Promise.all([searchParams, requireRole(["administrator"])]);
  const overview = await loadEmailQueueOverview();
  // With nothing chosen the page opens on what needs attention: failed mail, then mail still waiting, then what went out.
  const chosenStatus = parseQueueStatus(one(query.status));
  const status = chosenStatus === "all" ? defaultQueueStatus({
    waiting: overview ? overview.queued_immediate + overview.queued_bulk : 0,
    sending: overview?.sending ?? 0,
    failed: overview?.failed ?? 0,
  }) : chosenStatus;
  const deliveryClass = parseQueueClass(one(query.class));
  const q = safeSearchTerm(one(query.q));
  const page = Math.max(1, Number.parseInt(one(query.page) || "1", 10) || 1);

  let rowsQuery = createServiceClient().from("membership_notifications")
    .select("id,recipient_email,title,kind,delivery_class,email_status,email_attempts,last_email_error,requeue_count,created_at,email_sent_at,scheduled_for", { count: "exact" })
    .not("recipient_email", "is", null);
  rowsQuery = rowsQuery.eq("email_status", status);
  if (deliveryClass !== "all") rowsQuery = rowsQuery.eq("delivery_class", deliveryClass);
  if (q) rowsQuery = rowsQuery.or(`recipient_email.ilike.%${q}%,title.ilike.%${q}%`);
  const { data, count, error } = await rowsQuery.order("created_at", { ascending: status === "queued" }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load the email queue.");
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const budget = overview?.budget;
  const perDay = budget ? bulkPerDay(budget) : 0;
  const blocked = Boolean(budget?.blocked_until);
  const usedPercent = budget ? Math.min(100, Math.round((budget.used / Math.max(1, budget.daily_limit)) * 100)) : 0;
  const reservePercent = budget ? Math.min(100 - usedPercent, Math.round((budget.immediate_reserve / Math.max(1, budget.daily_limit)) * 100)) : 0;
  const message = flash(query);

  const href = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (deliveryClass !== "all") params.set("class", deliveryClass);
    if (q) params.set("q", q);
    for (const [key, value] of Object.entries(overrides)) { if (value) params.set(key, value); else params.delete(key); }
    const text = params.toString();
    return `/administrator/email-queue${text ? `?${text}` : ""}`;
  };
  const statusCounts: Record<QueueStatus, number | null> = {
    queued: overview ? overview.queued_immediate + overview.queued_bulk : null,
    sending: overview?.sending ?? null,
    sent: overview?.sent_7_days ?? null,
    failed: overview?.failed ?? null,
    cancelled: overview?.cancelled ?? null,
  };

  return <div className="portal-content">
    <header className="portal-heading">
      <div>
        <p className="eyebrow dark">Administrator only</p>
        <h1>Email queue</h1>
        <p>Every email the club sends goes through here. Tickets, sign-up codes and other messages someone is waiting for go out straight away. Bulk mail, such as renewal invitations, waits its turn so the club stays inside its daily sending limit.</p>
      </div>
      <Mail aria-hidden="true"/>
    </header>

    {message ? <p className={`form-message ${message.tone === "good" ? "success" : "error"}`} role={message.tone === "good" ? "status" : "alert"}>{message.text}</p> : null}

    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="budget-heading">
        <div className={styles.cardHead}><h2 id="budget-heading">Today’s sending</h2>
          <span className={`${styles.pill} ${blocked ? styles.pillFailed : budget?.bulk_paused ? styles.pillWait : styles.pillSent}`}>{blocked ? "Provider paused" : budget?.bulk_paused ? "Queued mail paused" : "Sending"}</span>
        </div>
        {!overview || !budget
          ? <p className={`form-message error ${styles.gap}`} role="alert">The queue could not be read. Has the latest database update been applied?</p>
          : <>
            <dl className={`${styles.stats} ${styles.gap}`}>
              <div><dt>Sent, last 24 hours</dt><dd>{budget.used} <small>of {budget.daily_limit}</small></dd></div>
              <div><dt>Room for queued mail</dt><dd>{budget.bulk_remaining}</dd></div>
              <div><dt>Waiting to send</dt><dd>{overview.queued_bulk + overview.queued_immediate}</dd></div>
              <div><dt>Failed</dt><dd>{overview.failed}</dd></div>
            </dl>
            <div className={styles.meter} role="img" aria-label={`${budget.used} of ${budget.daily_limit} emails used in the last 24 hours, ${budget.immediate_reserve} kept back for immediate mail`}>
              <span className={styles.meterUsed} style={{ width: `${usedPercent}%` }}/>
              <span className={styles.meterReserve} style={{ width: `${reservePercent}%` }}/>
            </div>
            <p className={`${styles.note} ${styles.gap}`}>
              The limit is counted over a rolling 24 hours, not the calendar day. {budget.immediate_reserve} of the {budget.daily_limit} are kept back for immediate mail, so queued mail can use up to {perDay} a day and never crowds out a ticket or a sign-up code.
              {" "}{clearEstimateLabel(overview.queued_bulk, perDay)}
              {budget.next_bulk_slot_at ? ` Room for more queued mail opens again around ${when(budget.next_bulk_slot_at)}.` : ""}
            </p>
            <p className={`${styles.note} ${styles.gap}`}>Sign-in links and password resets are sent by the sign-in service, not by this queue, so they are not counted here. The room kept back for immediate mail leaves space for them.</p>
            {blocked ? <p className={`${styles.banner} ${styles.bannerBad} ${styles.gap}`} role="alert">The email provider asked us to wait until {when(budget.blocked_until)}. {budget.blocked_reason}</p> : null}
            {budget.bulk_paused ? <p className={`${styles.banner} ${styles.bannerWarn} ${styles.gap}`}>Queued mail is paused. Nothing waiting will be sent until you resume it. Immediate mail still goes out.</p> : null}
          </>}
      </section>

      <section className={styles.card} aria-labelledby="controls-heading">
        <div className={styles.cardHead}><h2 id="controls-heading">Controls</h2></div>
        <div className={`${styles.actions} ${styles.gap}`}>
          <form action={setBulkPaused}>
            <input type="hidden" name="paused" value={budget?.bulk_paused ? "false" : "true"}/>
            <PendingSubmitButton className="button outline" pendingLabel="Saving…"
              confirmMessage={budget?.bulk_paused ? undefined : "Pause queued mail? Nothing waiting is sent until you resume. Tickets and sign-up codes still go out."}>
              {budget?.bulk_paused ? "Resume queued mail" : "Pause queued mail"}
            </PendingSubmitButton>
          </form>
          <form action={requeueFailedEmails}>
            <PendingSubmitButton className="button outline" pendingLabel="Queuing…" disabled={!overview?.failed}
              confirmMessage={`Put ${plural(overview?.failed ?? 0, "failed email")} back in the queue?`}>Put all failed back in the queue</PendingSubmitButton>
          </form>
          <form action={stopWaitingBulkEmails}>
            <PendingSubmitButton className={`button outline ${styles.danger}`} pendingLabel="Stopping…" disabled={!overview?.queued_bulk}
              confirmMessage={`Stop all ${plural(overview?.queued_bulk ?? 0, "waiting queued email")}? Nothing is deleted, and you can put them back afterwards from the Stopped list.`}>Stop all waiting queued mail</PendingSubmitButton>
          </form>
          {blocked
            ? <form action={clearProviderPause}><PendingSubmitButton className="button outline" pendingLabel="Saving…">Clear the provider pause</PendingSubmitButton></form> : null}
        </div>
        {overview ? <details className={`${styles.settings} ${styles.gap}`}>
          <summary>Limits</summary>
          <form action={saveQueueSettings} className={styles.settingsGrid}>
            <label>Daily limit<input name="daily_limit" type="number" inputMode="numeric" min={1} max={100000} required defaultValue={overview.budget.daily_limit}/><small>Most emails the club sends in any 24 hours. Match your email provider’s plan.</small></label>
            <label>Kept for immediate mail<input name="immediate_reserve" type="number" inputMode="numeric" min={0} max={99999} required defaultValue={overview.budget.immediate_reserve}/><small>Queued mail stops this many short of the limit.</small></label>
            <label>Queued emails at a time<input name="bulk_batch_size" type="number" inputMode="numeric" min={1} max={100} required defaultValue={overview.settings.bulk_batch_size}/><small>Sent each minute, so a big batch never goes out all at once.</small></label>
            <PendingSubmitButton className="button dark" pendingLabel="Saving…">Save limits</PendingSubmitButton>
          </form>
        </details> : null}
      </section>

      <section className={styles.card} aria-labelledby="list-heading">
        <div className={styles.cardHead}><h2 id="list-heading">Emails</h2><span className={styles.note}>{count ?? 0} {statusLabels[status].toLowerCase()}</span></div>
        <nav className={`${styles.chips} ${styles.gap}`} aria-label="Filter by state">
          {QUEUE_STATUSES.map((key) => <Link key={key} className={`${styles.chip} ${status === key ? styles.chipOn : ""}`} href={href({ status: key, page: "" })} prefetch={false} aria-current={status === key ? "true" : undefined}>{statusLabels[key]}{statusCounts[key] !== null ? <span>{statusCounts[key]}</span> : null}</Link>)}
        </nav>
        <form className={`${styles.filters} ${styles.gap}`} method="get" action="/administrator/email-queue">
          <input type="hidden" name="status" value={status}/>
          <label>Recipient or subject<input name="q" defaultValue={q} placeholder="Name, email or words in the subject" autoComplete="off"/></label>
          <label>Kind of mail
            <select name="class" defaultValue={deliveryClass}>
              <option value="all">All mail</option>
              {QUEUE_CLASSES.map((key) => <option key={key} value={key}>{classLabels[key]}</option>)}
            </select>
          </label>
          <button className="button dark" type="submit"><Search aria-hidden="true" size={16}/> Filter</button>
        </form>

        <form action={changeQueuedEmails} className={styles.gap}>
          <div className={styles.list}>
            {rows.some((row) => { const a = queueRowActions(row.email_status); return a.requeue || a.stop; }) ? <QueueToolbar/> : null}
            {rows.length === 0 ? <p className={styles.empty}>No emails match.</p> : rows.map((row) => {
              const actions = queueRowActions(row.email_status);
              const retryAt = row.email_status === "queued" && inTheFuture(row.scheduled_for) ? row.scheduled_for : null;
              return <article className={styles.row} key={row.id}>
                {actions.requeue || actions.stop
                  ? <input type="checkbox" name="ids" value={row.id} aria-label={`Select the email to ${row.recipient_email}`}/>
                  : <span aria-hidden="true"/>}
                <div className={styles.who}>
                  <strong>{row.recipient_email}</strong>
                  <span>{row.title}</span>
                  {row.last_email_error ? <small className={row.email_status === "failed" ? styles.err : undefined}>{row.last_email_error}</small> : null}
                  <div className={styles.rowActions}>
                    {actions.requeue ? <PendingSubmitButton name="intent" value={`requeue:${row.id}`} className={styles.rowBtn} pendingLabel="Working…">Put back in the queue</PendingSubmitButton> : null}
                    {actions.stop ? <PendingSubmitButton name="intent" value={`cancel:${row.id}`} className={styles.rowBtn} pendingLabel="Working…">Stop</PendingSubmitButton> : null}
                  </div>
                </div>
                <div className={styles.tags}>
                  <span className={`${styles.pill} ${statusPill[row.email_status]}`}>{statusLabels[row.email_status]}</span>
                  <span className={`${styles.pill} ${row.delivery_class === "bulk" ? styles.pillBulk : styles.pillNow}`}>{classLabels[row.delivery_class]}</span>
                </div>
                <div className={styles.when}>
                  {kindLabel(row.kind)}
                  <small>Added {when(row.created_at)}</small>
                  {row.email_sent_at && row.email_status === "sent" ? <small>Sent {when(row.email_sent_at)}</small> : null}
                  {retryAt ? <small>Next try {when(retryAt)}</small> : null}
                  {row.email_status === "failed" && row.email_attempts < MAX_ATTEMPTS
                    ? <small>Tried {plural(row.email_attempts, "time")} of {MAX_ATTEMPTS}. It will be tried again by itself.</small>
                    : row.email_attempts > 0 && row.email_status !== "sent" ? <small>{plural(row.email_attempts, "attempt")}. Gave up.</small> : null}
                  {row.requeue_count > 0 ? <small>Put back {plural(row.requeue_count, "time")}</small> : null}
                </div>
              </article>;
            })}
          </div>
        </form>
        <PortalPagination currentPage={Math.min(page, pages)} totalPages={pages} totalItems={count ?? 0} itemLabel="emails" href={(next) => href({ page: String(next) })} ariaLabel="Email queue pages"/>
      </section>
    </div>
  </div>;
}
