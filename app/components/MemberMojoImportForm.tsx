"use client";

import { useActionState } from "react";
import { AlertTriangle, Check, Database, FileSearch, FileUp, Mail, ShieldCheck } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import {
  applyMemberList,
  previewMemberList,
  sendMemberInvitations,
  type MemberImportApplyState,
  type MemberImportPreviewState,
  type MemberInvitationState,
} from "@/lib/actions/member-imports";
import type { MemberImportPreview } from "@/lib/membermojo";

const previewInitial: MemberImportPreviewState = { status: "idle" };
const applyInitial: MemberImportApplyState = { status: "idle" };
const inviteInitial: MemberInvitationState = { status: "idle" };

const plural = (value: number, singular: string, pluralForm = `${singular}s`) => `${value} ${value === 1 ? singular : pluralForm}`;

function ApplyForm({ preview }: { preview: MemberImportPreview }) {
  const [state, formAction] = useActionState(applyMemberList, applyInitial);
  if (state.status === "success" && state.result) {
    const result = state.result;
    return <section className="member-import-applied" aria-live="polite"><Check/><div>
      <span>Saved</span>
      <h3>{plural(result.added, "person", "people")} added, {plural(result.renewed, "member")} renewed for {preview.year}</h3>
      <p>{result.alreadyPaid} already paid for {preview.year} · {result.skipped} left out · {result.loginsLinked} linked to an existing website login.</p>
      <p>{plural(result.detailsFilled, "existing member")} had missing details (title, date of birth, phone or address) filled in.</p>
      <p>{plural(result.needInvitation, "person", "people")} can now be invited to the website. Use the invitations section below.</p>
    </div></section>;
  }
  return <section className="member-import-apply-panel" aria-labelledby="member-import-apply-heading">
    <div className="member-import-section-heading"><div><span>Final check</span><h3 id="member-import-apply-heading">Save this member list</h3></div><ShieldCheck/></div>
    <form action={formAction} className="stack-form member-import-apply-form">
      <input type="hidden" name="fileSha256" value={preview.fileSha256}/>
      <div className="member-import-apply-scope"><strong>This will:</strong><ul>
        <li>Add {plural(preview.totals.add, "new person", "new people")} and mark them as full members for {preview.year}, paid through MemberMojo.</li>
        <li>Renew {plural(preview.totals.renew, "existing member")} for {preview.year}.</li>
        <li>Fill in each person's title, date of birth, phone number and address where the file has them. Existing members keep what is already on their record; only blank details are filled in.</li>
        <li>Not send any email. Website invitations are sent separately, by you, afterwards.</li>
      </ul><strong>This will not:</strong><ul>
        <li>Remove or change anyone who is not in this file.</li>
        <li>Charge anyone or change any payment.</li>
      </ul></div>
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
          <small>Choose the CSV downloaded from MemberMojo. We read the name, email, Membership type, title, date of birth, phone number and address. Everyone in the file is made a full member for the current year.</small>
        </label>
        <PendingSubmitButton className="button dark" pendingLabel="Checking the file…"><FileSearch/>Show me what will happen</PendingSubmitButton>
      </form>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
    </section>

    {state.status === "success" && preview ? <section className="member-import-results" aria-live="polite">
      <header className="member-import-result-heading"><div><p className="eyebrow dark">Nothing has been saved yet</p><h2>{plural(preview.totals.people, "person", "people")} in this file</h2><p>Membership year {preview.year}. Columns used: {preview.columnsUsed.join(", ")}.{preview.birthMonthOnly ? " MemberMojo only records the month and year of birth, so dates are saved as the 1st of the month." : ""}{preview.totals.unreadableBirthDates ? ` ${preview.totals.unreadableBirthDates} date(s) of birth could not be read and are left blank.` : ""}{preview.notActive ? ` ${preview.notActive} not marked Active were left out.` : ""}</p></div><FileUp/></header>
      <div className="member-import-stats">
        <article><Database/><span>New people</span><strong>{preview.totals.add}</strong><small>added as full members</small></article>
        <article><Check/><span>Existing members</span><strong>{preview.totals.renew} renewed</strong><small>{preview.totals.alreadyPaid} already paid for {preview.year}</small></article>
        <article><Mail/><span>Website login</span><strong>{preview.totals.needInvitation} to invite</strong><small>{preview.totals.loginsToLink} already have a login and are linked</small></article>
        <article className={preview.totals.noBirthDate ? "has-warning" : ""}><Database/><span>Personal details</span><strong>{preview.totals.noBirthDate} without a date of birth</strong><small>{preview.totals.withPhone} phone · {preview.totals.withAddress} address · {preview.totals.withTitle} title</small></article>
        <article className={preview.totals.skipped || preview.flagged.length ? "has-warning" : ""}><AlertTriangle/><span>To look at</span><strong>{preview.flagged.length + preview.totals.skipped}</strong><small>{preview.totals.skipped} left out</small></article>
      </div>
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

export function SendInvitationsPanel({ pending }: { pending: number }) {
  const [state, formAction] = useActionState(sendMemberInvitations, inviteInitial);
  const remaining = state.remaining ?? pending;
  return <section className="portal-card member-import-card" aria-labelledby="member-invite-heading">
    <div className="member-import-section-heading"><div><span>Website invitations</span><h3 id="member-invite-heading">{remaining ? `${plural(remaining, "person", "people")} still to invite` : "Everyone imported has been invited"}</h3><p>Each person receives one email asking them to choose a password. Members who already have a login are linked without an email. Up to 40 are sent each time you press the button.</p></div><Mail/></div>
    {remaining ? <form action={formAction} className="stack-form">
      <PendingSubmitButton className="button dark" pendingLabel="Sending invitations…"><Mail/>Send the next {Math.min(remaining, 40)} invitations</PendingSubmitButton>
    </form> : null}
    {state.message ? <p className={`form-message ${state.status === "error" ? "error" : "success"}`} role="status">{state.message}</p> : null}
  </section>;
}
