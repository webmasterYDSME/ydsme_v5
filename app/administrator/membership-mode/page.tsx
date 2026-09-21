import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { loadEmailQueueOverview } from "@/lib/email-queue";
import { loadModeState, loadReadiness } from "@/lib/membership-mode";
import {
  WEBSITE_CONFIRMATION_WORD, blockers, warnings, type ReadinessLevel,
} from "@/lib/membership-mode-format";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { HandbookHelp } from "@/app/components/HandbookHelp";
import { switchToMemberMojo, switchToWebsite } from "./actions";
import styles from "./membership-mode.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership system" };

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const PAGE = "/administrator/membership-mode";

const when = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })
  : "";
const plural = (count: number, singular: string, many = `${singular}s`) => `${count} ${count === 1 ? singular : many}`;

const levelLabel: Record<ReadinessLevel, string> = { ok: "Ready", warning: "Check", blocked: "Fix first" };
const levelClass: Record<ReadinessLevel, string> = { ok: styles.pillOk, warning: styles.pillWarn, blocked: styles.pillBad };

function flash(query: Query): { tone: "good" | "bad"; text: string } | null {
  const notice = one(query.notice);
  const error = one(query.error);
  if (error) {
    const text = {
      reason: "Write a reason first. It is kept with the change.",
      confirmation: `Type the word ${WEBSITE_CONFIRMATION_WORD} to confirm.`,
      warnings: "Tick the box to accept the warnings, or sort them out first. Nothing was changed.",
      blocked: "Something that has to be fixed first is still not ready. Nothing was changed.",
      failed: "That did not work. Nothing was changed. Try again.",
    }[error] ?? "That did not work. Nothing was changed.";
    return { tone: "bad", text };
  }
  const stopped = Number(one(query.n) ?? 0);
  const messages: Record<string, string> = {
    website: "The website now runs membership. Members can apply, pay and renew on it.",
    membermojo: `MemberMojo runs membership again. The website's apply, checkout and renew pages send people to MemberMojo.${stopped ? ` ${plural(stopped, "queued email")} stopped.` : ""}`,
    unchanged: "That was already the current setting, so nothing changed.",
  };
  return notice && messages[notice] ? { tone: "good", text: messages[notice] } : null;
}

export default async function MembershipSystemPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query] = await Promise.all([searchParams, requireRole(["administrator"])]);
  const [state, checks, queue] = await Promise.all([loadModeState(), loadReadiness(), loadEmailQueueOverview()]);
  const message = flash(query);
  const website = state.mode === "website";
  const stoppers = blockers(checks);
  const cautions = warnings(checks);
  // Only the switch to the website has a confirmation step on the page, and only while MemberMojo runs membership.
  const confirming = !website && one(query.confirm) === "website" && stoppers.length === 0;
  const waitingBulk = queue?.queued_bulk ?? 0;

  return <div className="portal-content">
    <header className="portal-heading">
      <div>
        <p className="eyebrow dark">Administrator only</p>
        <h1>Membership system</h1>
        <p>Choose who runs membership: MemberMojo, as now, or this website. The change takes effect straight away, everywhere, and every change is recorded below.</p>
        <p><HandbookHelp chapter="switching-systems">Switching between MemberMojo and the website, in the handbook</HandbookHelp></p>
      </div>
      <ArrowLeftRight aria-hidden="true"/>
    </header>

    {message ? <p className={`form-message ${message.tone === "good" ? "success" : "error"}`} role={message.tone === "good" ? "status" : "alert"}>{message.text}</p> : null}
    {!state.readable ? <p className="form-message error" role="alert">The setting could not be read, so MemberMojo is assumed and nothing is charged or emailed. Has the latest database update been applied?</p> : null}

    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="now-heading">
        <div className={styles.cardHead}>
          <h2 id="now-heading">{website ? "The website runs membership" : "MemberMojo runs membership"}</h2>
          <span className={`${styles.pill} ${website ? styles.pillOk : styles.pillWarn}`}>{website ? "Website" : "MemberMojo"}</span>
        </div>
        <p className={`${styles.note} ${styles.gap}`}>
          {state.history.length > 0 && state.changedAt ? `Set ${when(state.changedAt)}${state.changedBy ? ` by ${state.changedBy}` : ""}.` : "Nobody has changed this yet, so it is still on the starting setting."}
        </p>
        <div className={styles.compare}>
          <div className={!website ? styles.current : undefined}>
            <h3>{!website ? "MemberMojo (now)" : "MemberMojo"}</h3>
            <ul>
              <li>Members apply, pay and renew on MemberMojo. The website’s apply, checkout and renew pages send people there.</li>
              <li>The Memberships area is hidden, and the website takes no card payments and sends no membership emails.</li>
              <li>You keep the website’s register and sign-ins up to date by importing MemberMojo’s member list. Members who are no longer in it are archived.</li>
            </ul>
          </div>
          <div className={website ? styles.current : undefined}>
            <h3>{website ? "The website (now)" : "The website"}</h3>
            <ul>
              <li>Members apply, pay by card and renew on the website. Officers record cash, bank and cheque payments.</li>
              <li>Membership officers use the Memberships area for applications, renewals, fees, reminders and receipts. Membership emails go through the queue, which keeps the daily limit.</li>
              <li>Importing a MemberMojo list still adds and renews members, but never archives anyone, because people who join on the website are not in MemberMojo.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="ready-heading">
        <div className={styles.cardHead}>
          <h2 id="ready-heading">{website ? "Is everything in order?" : "Is the website ready?"}</h2>
          <span className={`${styles.pill} ${stoppers.length ? styles.pillBad : cautions.length ? styles.pillWarn : styles.pillOk}`}>
            {stoppers.length ? `${plural(stoppers.length, "thing")} to fix` : cautions.length ? `${plural(cautions.length, "thing")} to check` : "All clear"}
          </span>
        </div>
        <ul className={styles.checks}>
          {checks.map((check) => <li key={check.key}>
            <span><span className={`${styles.pill} ${levelClass[check.level]}`}>{levelLabel[check.level]}</span></span>
            <strong>{check.label}</strong>
            <span>{check.detail}</span>
          </li>)}
        </ul>
        {!website ? <p className={`${styles.note} ${styles.gap}`}>These are checked again when you switch. Fix anything marked “Fix first”; anything marked “Check” can be accepted, with your reason recorded. <Link href="/administrator/member-import">Import the latest MemberMojo list</Link> just before switching, so the website starts with the right members.</p> : null}
      </section>

      {!website ? <section className={styles.card} aria-labelledby="switch-heading">
        <div className={styles.cardHead}><h2 id="switch-heading">Hand membership to the website</h2></div>
        {confirming ? <>
          <p className={`${styles.banner} ${styles.bannerWarn} ${styles.gap}`}>From the moment you confirm, the website’s apply, checkout and renew pages take over, the Memberships area opens, card payments are taken, and membership emails start going out through the queue. Importing a MemberMojo list will no longer archive anyone.</p>
          <form action={switchToWebsite} className={styles.form}>
            <label><span>Why are you switching?</span>
              <textarea name="reason" required maxLength={500} placeholder="For example: the 2027 renewals will run on the website."/>
              <small>Kept with the change, so the committee can see later why it was made.</small>
            </label>
            {cautions.length ? <label className={styles.tick}>
              <input type="checkbox" name="accept_warnings"/>
              <span>I have read the {plural(cautions.length, "thing")} marked “Check” above and want to switch anyway.</span>
            </label> : null}
            <label className={styles.confirm}><span>Type <b>{WEBSITE_CONFIRMATION_WORD}</b> to confirm</span>
              <input type="text" name="confirmation" required autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="confirm-help"/>
              <small id="confirm-help">You can switch back to MemberMojo at any time, with one click.</small>
            </label>
            <div className={styles.actions}>
              <PendingSubmitButton className="button dark" pendingLabel="Switching…">Switch to the website</PendingSubmitButton>
              <Link className="button outline" href={PAGE}>Cancel</Link>
            </div>
          </form>
        </> : <>
          {stoppers.length
            ? <p className={`${styles.banner} ${styles.bannerBad} ${styles.gap}`} role="alert">The website cannot take over yet. Fix the {plural(stoppers.length, "thing")} marked “Fix first” above.</p>
            : <p className={`${styles.note} ${styles.gap}`}>Nothing changes until you confirm on the next step.</p>}
          <div className={`${styles.actions} ${styles.gap}`}>
            {stoppers.length
              ? <span className="button dark" aria-disabled="true" style={{ opacity: 0.5, cursor: "not-allowed" }}>Hand membership to the website…</span>
              : <Link className="button dark" href={`${PAGE}?confirm=website`}>Hand membership to the website…</Link>}
          </div>
        </>}
      </section> : <section className={styles.card} aria-labelledby="back-heading">
        <div className={styles.cardHead}><h2 id="back-heading">Hand membership back to MemberMojo</h2></div>
        <p className={`${styles.note} ${styles.gap}`}>Use this if something is going wrong on the website, or to go back to MemberMojo for good. The website’s apply, checkout and renew pages send people to MemberMojo again, the Memberships area is hidden, and no membership emails go out. Payments that are already in progress are still recorded when they arrive. Card renewals already set up with Stripe carry on until they are cancelled there.</p>
        <p className={`${styles.note} ${styles.gap}`}>Members who joined or paid on the website are not in MemberMojo, so a MemberMojo import will keep them instead of archiving them.</p>
        <form action={switchToMemberMojo} className={styles.form}>
          <label><span>Reason (optional)</span>
            <textarea name="reason" maxLength={500} placeholder="For example: sign-ups are failing, back to MemberMojo while we look."/>
          </label>
          <label className={styles.tick}>
            <input type="checkbox" name="stop_emails" defaultChecked/>
            <span>Also stop the {plural(waitingBulk, "queued membership email")} still waiting to go out. They would be out of date if the website took over again. You can put them back from the email queue.</span>
          </label>
          <div className={styles.actions}>
            <PendingSubmitButton className={`button outline ${styles.danger}`} pendingLabel="Switching…"
              confirmMessage="Switch back to MemberMojo now? The website stops taking payments and sending membership emails straight away.">
              Switch back to MemberMojo
            </PendingSubmitButton>
          </div>
        </form>
      </section>}

      <section className={styles.card} aria-labelledby="history-heading">
        <div className={styles.cardHead}><h2 id="history-heading">Changes</h2></div>
        {state.history.length === 0
          ? <p className={`${styles.note} ${styles.gap}`}>No changes yet. MemberMojo has run membership since the website was set up.</p>
          : <ul className={styles.history}>
            {state.history.map((change) => <li key={change.id}>
              <span><strong>{change.to === "website" ? "Switched to the website" : "Switched back to MemberMojo"}</strong>: {change.reason}</span>
              <small>{when(change.changedAt)}{change.changedBy ? ` · ${change.changedBy}` : ""}{change.cancelledEmails ? ` · ${plural(change.cancelledEmails, "queued email")} stopped` : ""}</small>
            </li>)}
          </ul>}
      </section>
    </div>
  </div>;
}
