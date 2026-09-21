"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, Check, Database, FileSearch, FileUp, Mail, Pause, ShieldCheck, UserMinus } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import {
  applyMemberList,
  previewMemberList,
  pauseMemberInvitations,
  startMemberInvitations,
  type MemberImportApplyState,
  type MemberImportPreviewState,
  type MemberInvitationState,
} from "@/lib/actions/member-imports";
import type { MemberImportPreview, MemberInvitationStatus } from "@/lib/membermojo";

const previewInitial: MemberImportPreviewState = { status: "idle" };
const applyInitial: MemberImportApplyState = { status: "idle" };
const inviteInitial: MemberInvitationState = { status: "idle" };

const stateLabel = (state: string) => ({ active: "Active", grace: "Grace period", lapsed: "Lapsed", honorary: "Honorary" }[state] ?? state);
const plural = (value: number, singular: string, pluralForm = `${singular}s`) => `${value} ${value === 1 ? singular : pluralForm}`;

function ApplyForm({ preview }: { preview: MemberImportPreview }) {
  const [state, formAction] = useActionState(applyMemberList, applyInitial);
  if (state.status === "success" && state.result) {
    const result = state.result;
    return <section className="member-import-applied" aria-live="polite"><Check/><div>
      <span>Saved</span>
      <h3>{plural(result.added, "person", "people")} added, {plural(result.renewed, "member")} renewed for {preview.year}</h3>
      <p>{result.alreadyPaid} already paid for {preview.year} · {result.skipped} left out · {result.loginsLinked} linked to an existing website login.</p>
      {result.honorary ? <p>{plural(result.honorary, "person", "people")} became lifetime honorary members (Life or Associate Volunteer): no fee, no renewal.</p> : null}
      {result.archived || result.restored ? <p>{result.archived ? `${plural(result.archived, "member")} not in the list archived: they no longer have website access. ` : ""}{result.restored ? `${plural(result.restored, "member")} restored because they are back in the list.` : ""}</p> : null}
      <p>{plural(result.newsletter, "new person", "new people")} subscribed to the newsletter.</p>
      <p>{plural(result.detailsFilled, "existing member")} had missing details (title, date of birth, phone or address) filled in.</p>
      <p>{plural(result.needInvitation, "person", "people")} can now be invited to the website. Use the invitations section below.</p>
    </div></section>;
  }
  return <section className="member-import-apply-panel" aria-labelledby="member-import-apply-heading">
    <div className="member-import-section-heading"><div><span>Final check</span><h3 id="member-import-apply-heading">Save this member list</h3></div><ShieldCheck/></div>
    <form action={formAction} className="stack-form member-import-apply-form">
      <input type="hidden" name="fileSha256" value={preview.fileSha256}/>
      <div className="member-import-apply-scope"><strong>This will:</strong><ul>
        <li>Add {plural(preview.totals.add, "new person", "new people")}{preview.totals.honorary ? `, of whom ${preview.totals.honorary} become lifetime honorary members (no fee),` : ""} and mark the rest as full members for {preview.year}, paid through MemberMojo.</li>
        <li>Renew {plural(preview.totals.renew, "existing member")} for {preview.year}.</li>
        <li>Fill in each person’s title, date of birth, phone number and address where the file has them. Existing members keep what is already on their record; only blank details are filled in.</li>
        <li>Subscribe {plural(preview.totals.newsletter, "new person", "new people")} to the newsletter: everyone with an email address (not Juniors) who has not unsubscribed from MemberMojo’s group emails. The club treats that as their agreement. Existing members are not changed, and each record shows where the consent came from.</li>
        <li>Archive {plural(preview.totals.archive, "member")} who {preview.totals.archive === 1 ? "is" : "are"} not in this file. They lose website access and leave the active register. Nothing is deleted, and an administrator can restore them until the retention rules remove them.</li>
        {preview.totals.restored ? <li>Restore {plural(preview.totals.restored, "member")} that an earlier import archived and who are back in the file.</li> : null}
        <li>Not send any email. Website invitations are sent separately, by you, afterwards.</li>
      </ul><strong>This will not:</strong><ul>
        <li>Archive administrators or committee logins, anyone under a legal hold, suspended members or payments being checked.</li>
        <li>Charge anyone or change any payment.</li>
      </ul></div>
      {preview.archiveConfirmation !== null ? <label className="member-import-archive-check">Type {preview.archiveConfirmation} to confirm that {plural(preview.archiveConfirmation, "member")} will be archived
        <input name="archiveCount" inputMode="numeric" autoComplete="off" pattern="[0-9]*" required/>
        <small>This is a large change. If the number is a surprise, this may be the wrong file.</small>
      </label> : null}
      <label>Choose the same MemberMojo file again
        <input type="file" name="file" accept="text/csv,.csv" required/>
        <small>The file is read again for saving and must be exactly the one you checked. It is not kept.</small>
      </label>
      <label className="member-import-review-check"><input type="checkbox" name="confirmed" value="yes" required/><span>I have checked the things to look at and want to save this list.</span></label>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
      <PendingSubmitButton className="button dark" pendingLabel="Saving the member list…"><Database/>Save member list</PendingSubmitButton>
    </form>
  </section>;
}

export function MemberMojoImportForm() {
  const [state, formAction] = useActionState(previewMemberList, previewInitial);
  const preview = state.preview;
  return <div className="member-import-workspace">
    <section className="portal-card member-import-card">
      <div className="member-import-safety"><ShieldCheck/><div><strong>Looking at the file changes nothing</strong><p>We read the file to show you what would happen. Nothing is saved until you confirm.</p></div></div>
      <form action={formAction} className="stack-form member-import-form">
        <label>MemberMojo member-list file
          <input type="file" name="file" accept="text/csv,.csv" required/>
          <small>Choose the CSV downloaded from MemberMojo. We read the name, email, Membership type, title, date of birth, phone number and address. Everyone in the file is made a full member for the current year. Members who are not in the file are archived.</small>
        </label>
        <PendingSubmitButton className="button dark" pendingLabel="Checking the file…"><FileSearch/>Show me what will happen</PendingSubmitButton>
      </form>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
    </section>

    {state.status === "success" && preview ? <section className="member-import-results" aria-live="polite">
      <header className="member-import-result-heading"><div><p className="eyebrow dark">Nothing has been saved yet</p><h2>{plural(preview.totals.people, "person", "people")} in this file</h2><p>Membership year {preview.year}. Columns used: {preview.columnsUsed.join(", ")}.{preview.birthMonthOnly ? " MemberMojo only records the month and year of birth, so dates are saved as the 1st of the month." : ""}{preview.totals.unreadableBirthDates ? ` ${preview.totals.unreadableBirthDates} date(s) of birth could not be read and are left blank.` : ""}{preview.notActive ? ` ${preview.notActive} not marked Active were left out.` : ""}</p></div><FileUp/></header>
      <div className="member-import-stats">
        <article><Database/><span>New people</span><strong>{preview.totals.add}</strong><small>{preview.totals.honorary ? `${preview.totals.honorary} honorary · ${preview.totals.add - preview.totals.honorary} full members` : "added as full members"}</small></article>
        <article><Check/><span>Existing members</span><strong>{preview.totals.renew} renewed</strong><small>{preview.totals.alreadyPaid} already paid for {preview.year}</small></article>
        <article><Mail/><span>Website login</span><strong>{preview.totals.needInvitation} to invite</strong><small>{preview.totals.loginsToLink} already have a login and are linked</small></article>
        <article className={preview.totals.archive ? "has-warning" : ""}><UserMinus/><span>Not in the file</span><strong>{preview.totals.archive} to archive</strong><small>{preview.totals.kept ? `${preview.totals.kept} kept as they are` : "everyone else is in the file"}{preview.totals.restored ? ` · ${preview.totals.restored} restored` : ""}</small></article>
        <article className={preview.totals.noBirthDate ? "has-warning" : ""}><Database/><span>Personal details</span><strong>{preview.totals.noBirthDate} without a date of birth</strong><small>{preview.totals.withPhone} phone · {preview.totals.withAddress} address · {preview.totals.withTitle} title · {preview.totals.newsletter} newsletter</small></article>
        <article className={preview.totals.skipped || preview.flagged.length ? "has-warning" : ""}><AlertTriangle/><span>To look at</span><strong>{preview.flagged.length + preview.totals.skipped}</strong><small>{preview.totals.skipped} left out</small></article>
      </div>
      {preview.toArchive.length ? <details className="member-import-details" open>
        <summary>Will be archived ({preview.toArchive.length})</summary>
        <p className="form-help">These members are on the website register but not in the MemberMojo file.</p>
        <div className="member-import-review-list">{preview.toArchive.map((item, index) => <article key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{[item.plan, item.email ?? "No email address", stateLabel(item.state), item.hasLogin ? "Has a website login" : null].filter(Boolean).join(" · ")}</p></article>)}</div>
      </details> : null}
      {preview.kept.length ? <details className="member-import-details">
        <summary>Not in the file, but kept ({preview.kept.length})</summary>
        <div className="member-import-review-list">{preview.kept.map((item, index) => <article key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{[item.detail, item.email].filter(Boolean).join(" · ")}</p></article>)}</div>
      </details> : null}
      {preview.skipped.length ? <details className="member-import-details" open>
        <summary>Left out ({preview.skipped.length})</summary>
        <div className="member-import-review-list">{preview.skipped.map((item, index) => <article key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{item.detail}</p></article>)}</div>
      </details> : null}
      {preview.flagged.length ? <details className="member-import-details">
        <summary>Worth a look ({preview.flagged.length})</summary>
        <div className="member-import-review-list">{preview.flagged.map((item, index) => <article key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{item.detail}</p></article>)}</div>
      </details> : null}
      <ApplyForm key={preview.fileSha256} preview={preview}/>
    </section> : null}
  </div>;
}

export function SendInvitationsPanel({ status }: { status: MemberInvitationStatus }) {
  const router = useRouter();
  const [startState, startAction] = useActionState(startMemberInvitations, inviteInitial);
  const [pauseState, pauseAction] = useActionState(pauseMemberInvitations, inviteInitial);
  // While the run is going, keep the numbers fresh without the administrator pressing anything.
  useEffect(() => {
    if (!status.enabled) return;
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [status.enabled, router]);

  const waiting = status.enabled && status.pausedUntil;
  const heading = status.enabled
    ? waiting ? "Waiting for the email limit to reset" : "Sending invitations"
    : status.pending ? `${plural(status.pending, "person", "people")} still to invite`
    : status.finishedAt ? "Everyone imported has been invited" : "Nobody is waiting for an invitation";
  const message = pauseState.message ?? startState.message;
  const failed = (pauseState.status === "error" && pauseState.message) || (startState.status === "error" && startState.message);

  return <section className="portal-card member-import-card" aria-labelledby="member-invite-heading">
    <div className="member-import-section-heading"><div><span>Website invitations</span><h3 id="member-invite-heading">{heading}</h3>
      <p>Each person receives one email with a secure link that opens their account. No password is needed; they sign in later with a one-time link sent to their email. Members who already have a login are linked without an email.</p>
      <p>Press the button once. A few invitations go out every five minutes (about 60 an hour), failures are tried again, and it stops by itself when everyone has been invited. You can leave this page.</p></div><Mail/></div>
    {status.enabled ? <p className="form-help" role="status">
      {status.pending} still to invite · {status.sent} invited and {status.linked} linked since it started{status.failed ? ` · ${status.failed} failed attempts` : ""}.
      {waiting && status.pausedUntil ? ` The email service has reached its hourly limit. Trying again at ${format(new Date(status.pausedUntil), "HH:mm")}.` : ""}
    </p> : status.finishedAt ? <p className="form-help" role="status">Finished on {format(new Date(status.finishedAt), "d MMMM yyyy 'at' HH:mm")}: {status.sent} invited and {status.linked} linked to an existing login.</p> : null}
    {status.gaveUp ? <p className="form-message error" role="status">{plural(status.gaveUp, "person", "people")} could not be invited after five tries. Check their email addresses, then press the button again to try them once more.</p> : null}
    {status.lastError && !waiting ? <p className="form-message error" role="status">{status.lastError}</p> : null}
    {status.enabled
      ? <form action={pauseAction} className="stack-form"><PendingSubmitButton className="button secondary" pendingLabel="Pausing…"><Pause/>Pause invitations</PendingSubmitButton></form>
      : status.pending || status.gaveUp
        ? <form action={startAction} className="stack-form"><PendingSubmitButton className="button dark" pendingLabel="Starting…"><Mail/>{status.startedAt ? "Invite everyone left" : "Invite everyone"}</PendingSubmitButton></form>
        : null}
    {message ? <p className={`form-message ${failed ? "error" : "success"}`} role="status">{message}</p> : null}
  </section>;
}
