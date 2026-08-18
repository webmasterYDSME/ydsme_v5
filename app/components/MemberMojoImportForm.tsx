"use client";

import { useActionState } from "react";
import { AlertTriangle, Database, FileSearch, FileUp, Link2, ShieldCheck } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { previewMemberMojoImport, type MemberImportActionState } from "@/lib/actions/member-imports";

const initialState: MemberImportActionState = { status: "idle" };

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export function MemberMojoImportForm() {
  const [state, formAction] = useActionState(previewMemberMojoImport, initialState);
  const preview = state.preview;
  const expiredActive = preview?.issues.filter(issue => issue.code === "active-past-expiry") ?? [];

  return <div className="member-import-workspace">
    <section className="portal-card member-import-card">
      <div className="member-import-safety"><ShieldCheck/><div><strong>Preview is read-only</strong><p>The uploaded file is parsed in memory. Previewing does not update memberships, portal access, roles, or Supabase Auth.</p></div></div>
      <form action={formAction} className="stack-form member-import-form">
        <label>MemberMojo CSV file
          <input type="file" name="file" accept="text/csv,.csv" required/>
          <small>Use the CSV downloaded directly from MemberMojo. Maximum 1,000 rows and 750 KB.</small>
        </label>
        <fieldset>
          <legend>How complete is this export?</legend>
          <label className="member-import-mode" htmlFor="member-import-update-only" aria-label="Update-only export"><input id="member-import-update-only" type="radio" name="mode" value="update_only" defaultChecked/><span><strong>Update-only export</strong><small>Compare members present in the file. Absence has no meaning.</small></span></label>
          <label className="member-import-mode" htmlFor="member-import-complete-snapshot" aria-label="Complete active-member snapshot"><input id="member-import-complete-snapshot" type="radio" name="mode" value="complete_active_snapshot"/><span><strong>Complete active-member snapshot</strong><small>Also count currently active membership records missing from the file.</small></span></label>
        </fieldset>
        <PendingSubmitButton className="button dark" pendingLabel="Comparing securely…"><FileSearch/>Create comparison preview</PendingSubmitButton>
      </form>
      {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
    </section>

    {state.status === "success" && preview ? <section className="member-import-results" aria-live="polite">
      <div className="form-message success"><ShieldCheck/><span>{state.message}</span></div>
      <header className="member-import-result-heading"><div><p className="eyebrow dark">Comparison preview</p><h2>{plural(preview.totals.uploadedRows, "member row")}</h2><p>File {preview.fileFingerprint} · {preview.encoding} · {preview.mode === "update_only" ? "update only" : "complete active snapshot"}</p></div><FileUp/></header>

      <div className="member-import-stats">
        <article><Database/><span>Membership records</span><strong>{preview.totals.newRecords} new</strong><small>{preview.totals.changedRecords} changed · {preview.totals.unchangedRecords} unchanged</small></article>
        <article><Link2/><span>Portal links</span><strong>{preview.totals.portalLinkCandidates} candidates</strong><small>{preview.totals.alreadyLinked} already linked</small></article>
        <article className={preview.totals.warnings ? "has-warning" : ""}><AlertTriangle/><span>Review flags</span><strong>{plural(preview.totals.warnings, "warning")}</strong><small>{preview.totals.information} informational</small></article>
        <article><FileSearch/><span>Snapshot coverage</span><strong>{preview.totals.activeRows} Active</strong><small>{preview.totals.missingFromSnapshot} active records absent</small></article>
      </div>

      {expiredActive.length ? <section className="member-import-exceptions" aria-labelledby="expired-active-heading">
        <div className="member-import-section-heading"><div><span>Priority review</span><h3 id="expired-active-heading">{plural(expiredActive.length, "expired record")} explicitly marked Active</h3></div><AlertTriangle/></div>
        <div className="member-import-review-list">{expiredActive.map(issue => <article key={`${issue.rowNumber}-${issue.externalId}`}><span>Row {issue.rowNumber} · ID {issue.externalId}</span><strong>{issue.memberName}</strong><p>{issue.message}</p></article>)}</div>
      </section> : null}

      {preview.issues.length ? <details className="member-import-details" open={!expiredActive.length}>
        <summary>All review flags ({preview.totals.warnings + preview.totals.information})</summary>
        <div className="member-import-issue-table"><div className="member-import-table-head"><span>Member</span><span>Severity</span><span>Reason</span></div>{preview.issues.map((issue, index) => <div key={`${issue.rowNumber}-${issue.code}-${index}`}><span><strong>{issue.memberName || "File"}</strong><small>{issue.rowNumber ? `Row ${issue.rowNumber} · ID ${issue.externalId}` : "File-level check"}</small></span><span className={`member-import-severity is-${issue.severity}`}>{issue.severity}</span><p>{issue.message}</p></div>)}</div>
        {preview.issuesTruncated ? <p className="form-help">Only the first 150 flags are shown.</p> : null}
      </details> : null}

      {preview.rows.length ? <details className="member-import-details">
        <summary>New and changed records ({preview.totals.newRecords + preview.totals.changedRecords})</summary>
        <div className="member-import-change-list">{preview.rows.map(row => <article key={row.externalId}><span>{row.outcome} · ID {row.externalId}</span><strong>{row.memberName}</strong><p>{row.changedFields.length ? `Changes: ${row.changedFields.join(", ")}.` : "A new membership record would be created."} Portal match: {row.portalMatch.replaceAll("-", " ")}.</p></article>)}</div>
        {preview.rowsTruncated ? <p className="form-help">Only the first 150 new or changed records are shown.</p> : null}
      </details> : null}

      {preview.ignoredHeaders.length ? <details className="member-import-details"><summary>Ignored CSV columns ({preview.ignoredHeaders.length})</summary><p className="form-help">{preview.ignoredHeaders.join(", ")}</p></details> : null}
      <div className="member-import-apply-placeholder"><ShieldCheck/><div><strong>Applying changes is not enabled yet</strong><p>This first implementation deliberately stops after comparison. The next stage will add an administrator confirmation step, an audit record, and safe, reversible membership updates.</p></div><button type="button" disabled>Apply import</button></div>
    </section> : null}
  </div>;
}
