"use client";

import { useActionState } from "react";
import { AlertTriangle, Check, Database, FileSearch, FileUp, Link2, ShieldCheck } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import {
  applyMemberMojoImport,
  previewMemberMojoImport,
  type MemberImportActionState,
  type MemberImportApplyActionState,
} from "@/lib/actions/member-imports";
import type { MemberImportPreview } from "@/lib/membermojo";

const initialState: MemberImportActionState = { status: "idle" };
const initialApplyState: MemberImportApplyActionState = { status: "idle" };

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function ApplyMemberImportForm({ preview }: { preview: MemberImportPreview }) {
  const [state, formAction] = useActionState(applyMemberMojoImport, initialApplyState);
  const completeSnapshot = preview.mode === "complete_active_snapshot";

  if (state.status === "success") {
    return <section className="member-import-applied" aria-live="polite"><Check/><div><span>Update finished</span><h3>{plural(state.processedCount ?? 0, "member")} checked</h3><p>{state.createdCount} added · {state.refreshedCount} updated.</p><p className="member-import-lifecycle-result">{state.endedCount} marked as ended · {state.restoredCount} marked as current again · {state.portalAccessReviewCount} sign-ins need checking</p><p>Nobody’s sign-in, login email, or website access level was changed.</p></div></section>;
  }
  if (!preview.canApply) {
    return <section className="member-import-apply-placeholder"><ShieldCheck/><div><strong>This file was used before</strong><p>These changes have already been saved. Download a newer file from MemberMojo if you need to update the list again.</p></div><button type="button" disabled>Already saved</button></section>;
  }

  return <section className="member-import-apply-panel" aria-labelledby="member-import-apply-heading">
    <div className="member-import-section-heading"><div><span>Final safety check</span><h3 id="member-import-apply-heading">Save these member changes</h3><p>This check closes at {new Date(preview.expiresAt).toLocaleString("en-GB")}.</p></div><ShieldCheck/></div>
    <form action={formAction} className="stack-form member-import-apply-form">
      <input type="hidden" name="importId" value={preview.importId}/>
      <p className="form-help">Choose the same file again. We check that it has not changed, then read it without keeping a copy.</p>
      <label>Choose the same MemberMojo file
        <input type="file" name="file" accept="text/csv,.csv" required/>
      </label>
      <label className="member-import-review-check" aria-label="I have checked the warnings"><input type="checkbox" name="reviewed" value="yes" required/><span>I have checked the warnings and understand that the member details will be saved as they appear in MemberMojo.</span></label>
      <label>To make sure this is deliberate, type <code className="member-import-confirmation-phrase">APPLY MEMBERMOJO IMPORT</code>
        <input name="confirmation" autoComplete="off" required/>
      </label>
      <div className="member-import-apply-scope"><strong>This will:</strong><ul><li>Add new members and update existing member details.</li>{completeSnapshot ? <><li>Mark {plural(preview.totals.missingFromSnapshot, "current member")} missing from this full list as having left.</li><li>Keep former-member details for 12 months and ask an administrator to check any website sign-in.</li></> : <li>Leave anyone who is not in this file exactly as they are.</li>}</ul><strong>This will not:</strong><ul><li>Change anyone’s website sign-in, login email, or access level.</li><li>Pause, turn off, or delete any website account.</li></ul></div>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
      <PendingSubmitButton className="button dark" pendingLabel="Saving member changes…"><Database/>Save member changes</PendingSubmitButton>
    </form>
  </section>;
}

export function MemberMojoImportForm() {
  const [state, formAction] = useActionState(previewMemberMojoImport, initialState);
  const preview = state.preview;
  const expiredActive = preview?.issues.filter(issue => issue.code === "active-past-expiry") ?? [];

  return <div className="member-import-workspace">
    <section className="portal-card member-import-card">
      <div className="member-import-safety"><ShieldCheck/><div><strong>Looking at the file changes nothing</strong><p>We read the file to show you what would happen, but we do not keep the file or change any member until you complete the final safety check.</p></div></div>
      <form action={formAction} className="stack-form member-import-form">
        <label>MemberMojo member-list file
          <input type="file" name="file" accept="text/csv,.csv" required/>
          <small>Choose the CSV file downloaded directly from MemberMojo. It can contain up to 1,000 people.</small>
        </label>
        <fieldset>
          <legend>Who is included in this file?</legend>
          <label className="member-import-mode" htmlFor="member-import-update-only" aria-label="Only update people in this file"><input id="member-import-update-only" type="radio" name="mode" value="update_only" defaultChecked/><span><strong>Only update people in this file</strong><small>Use this if the file may not contain every current member. Anyone missing from it will be left alone.</small></span></label>
          <label className="member-import-mode" htmlFor="member-import-complete-snapshot" aria-label="This is the full list of current members"><input id="member-import-complete-snapshot" type="radio" name="mode" value="complete_active_snapshot"/><span><strong>This is the full list of current members</strong><small>Use this only when the secretary confirms that every current member is included. Missing people will be treated as having left.</small></span></label>
        </fieldset>
        <PendingSubmitButton className="button dark" pendingLabel="Checking the file…"><FileSearch/>Show me what will change</PendingSubmitButton>
      </form>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
    </section>

    {state.status === "success" && preview ? <section className="member-import-results" aria-live="polite">
      <div className="form-message success"><ShieldCheck/><span>{state.message}</span></div>
      <header className="member-import-result-heading"><div><p className="eyebrow dark">Nothing has been saved yet</p><h2>{plural(preview.totals.uploadedRows, "person")} in this file</h2><p>{preview.mode === "update_only" ? "Only people in this file will be updated." : "You said this is the full list of current members."}</p></div><FileUp/></header>

      <div className="member-import-stats">
        <article><Database/><span>Member details</span><strong>{preview.totals.newRecords} new</strong><small>{preview.totals.changedRecords} will change · {preview.totals.unchangedRecords} already match</small></article>
        <article><Link2/><span>Website accounts</span><strong>{preview.totals.portalLinkCandidates} possible matches</strong><small>{preview.totals.alreadyLinked} already matched</small></article>
        <article className={preview.totals.warnings ? "has-warning" : ""}><AlertTriangle/><span>Things to check</span><strong>{plural(preview.totals.warnings, "warning")}</strong><small>{preview.totals.information} useful notes</small></article>
        <article><FileSearch/><span>Current members</span><strong>{preview.totals.activeRows} marked Active</strong><small>{preview.totals.missingFromSnapshot} current people missing from this file</small></article>
      </div>

      {expiredActive.length ? <section className="member-import-exceptions" aria-labelledby="expired-active-heading">
        <div className="member-import-section-heading"><div><span>Please check these first</span><h3 id="expired-active-heading">{plural(expiredActive.length, "person")} marked Active after their end date</h3></div><AlertTriangle/></div>
        <div className="member-import-review-list">{expiredActive.map(issue => <article key={`${issue.rowNumber}-${issue.externalId}`}><span>Row {issue.rowNumber} · ID {issue.externalId}</span><strong>{issue.memberName}</strong><p>{issue.message}</p></article>)}</div>
      </section> : null}

      {preview.issues.length ? <details className="member-import-details" open={!expiredActive.length}>
        <summary>See everything that needs checking ({preview.totals.warnings + preview.totals.information})</summary>
        <div className="member-import-issue-table"><div className="member-import-table-head"><span>Member</span><span>Importance</span><span>What to check</span></div>{preview.issues.map((issue, index) => <div key={`${issue.rowNumber}-${issue.code}-${index}`}><span><strong>{issue.memberName || "Whole file"}</strong><small>{issue.rowNumber ? `Line ${issue.rowNumber} · MemberMojo ID ${issue.externalId}` : "This is about the whole file"}</small></span><span className={`member-import-severity is-${issue.severity}`}>{issue.severity === "warning" ? "Please check" : "Good to know"}</span><p>{issue.message}</p></div>)}</div>
        {preview.issuesTruncated ? <p className="form-help">The first 150 items are shown.</p> : null}
      </details> : null}

      {preview.rows.length ? <details className="member-import-details">
        <summary>See new people and changed details ({preview.totals.newRecords + preview.totals.changedRecords})</summary>
        <div className="member-import-change-list">{preview.rows.map(row => <article key={row.externalId}><span>{row.outcome === "new" ? "New person" : "Details changed"} · MemberMojo ID {row.externalId}</span><strong>{row.memberName}</strong><p>{row.changedFields.length ? `Details that will change: ${row.changedFields.join(", ")}.` : "A new member will be added."} Website account: {row.portalMatch.replaceAll("-", " ")}.</p></article>)}</div>
        {preview.rowsTruncated ? <p className="form-help">The first 150 new or changed people are shown.</p> : null}
      </details> : null}

      {preview.ignoredHeaders.length ? <details className="member-import-details"><summary>Extra columns we did not use ({preview.ignoredHeaders.length})</summary><p className="form-help">{preview.ignoredHeaders.join(", ")}</p></details> : null}
      <ApplyMemberImportForm key={preview.importId} preview={preview}/>
    </section> : null}
  </div>;
}
