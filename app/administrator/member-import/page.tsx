import Link from "next/link";
import { format } from "date-fns";
import { Clock, FileUp, ShieldCheck, UserX } from "lucide-react";
import { MemberMojoImportForm } from "@/app/components/MemberMojoImportForm";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { resolveMemberMojoPortalAccessReview } from "@/lib/actions/member-imports";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Query = { error?: string; notice?: string };

const notices: Record<string, string> = {
  "portal-access-archived": "Portal access was archived and the review decision was audited.",
  "portal-access-retained": "Portal access was retained and the review decision was audited.",
};

export default async function MemberImportPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, { user }] = await Promise.all([searchParams, requireCapability("members.manage")]);
  const admin = createAdminClient();
  const { data: reviews, count, error } = await admin
    .from("membership_records")
    .select("id,auth_user_id,first_name,last_name,source_state,source_expires_on,membership_ended_at,retention_until", { count: "exact" })
    .eq("portal_access_review_required", true)
    .order("membership_ended_at")
    .limit(100);
  if (error) throw new Error("Unable to load MemberMojo portal-access reviews.");

  const portalIds = [...new Set((reviews ?? []).flatMap(review => review.auth_user_id ? [review.auth_user_id] : []))];
  const [portalUsersResult, portalRolesResult] = portalIds.length
    ? await Promise.all([
      admin.from("users").select("id,full_name,email,membership_status").in("id", portalIds),
      admin.from("user_roles").select("user_id,role").in("user_id", portalIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (portalUsersResult.error || portalRolesResult.error) {
    throw new Error("Unable to load linked portal-account details.");
  }
  const portalUsers = portalUsersResult.data;
  const portalRoles = portalRolesResult.data;
  const usersById = new Map((portalUsers ?? []).map(portalUser => [portalUser.id, portalUser]));
  const rolesById = new Map((portalRoles ?? []).map(role => [role.user_id, role.role]));

  return <div className="portal-content">
    <header className="portal-heading"><div><p className="eyebrow dark">Administrator · Membership data</p><h1>MemberMojo import</h1><p>Upload an export, review discrepancies and reconcile membership lifecycle without silently changing portal permissions.</p></div><FileUp/></header>
    {query.error ? <p className="form-message error" role="alert">{query.error}</p> : null}
    {query.notice && notices[query.notice] ? <p className="form-message success">{notices[query.notice]}</p> : null}
    <MemberMojoImportForm/>

    <section className="member-access-reviews" aria-labelledby="portal-access-review-heading">
      <header className="member-import-result-heading"><div><p className="eyebrow dark">Human decision required</p><h2 id="portal-access-review-heading">Portal access reviews</h2><p>These ended memberships remain linked to portal accounts. No account is changed until an administrator records a decision.</p></div><span className="count-badge"><Clock/>{count ?? 0} pending</span></header>
      {(reviews ?? []).length ? <div className="member-access-review-list">{reviews?.map(review => {
        const portalUser = review.auth_user_id ? usersById.get(review.auth_user_id) : undefined;
        const portalRole = review.auth_user_id ? rolesById.get(review.auth_user_id) ?? "member" : "member";
        const cannotArchive = review.auth_user_id === user.id || portalRole === "administrator";
        return <article key={review.id}>
          <div className="member-access-review-summary"><div><span>MemberMojo membership ended</span><h3>{review.first_name} {review.last_name}</h3><p>{review.source_state}{review.source_expires_on ? ` · source expiry ${format(new Date(`${review.source_expires_on}T00:00:00Z`), "d MMMM yyyy")}` : ""}</p></div><span className={`member-status is-${portalUser?.membership_status ?? "archived"}`}>{portalUser?.membership_status ?? "portal account unavailable"}</span></div>
          <dl><div><dt>Portal account</dt><dd>{portalUser?.full_name || "Name not set"}<small>{portalUser?.email}</small></dd></div><div><dt>Website role</dt><dd>{portalRole}</dd></div><div><dt>Ended</dt><dd>{review.membership_ended_at ? format(new Date(review.membership_ended_at), "d MMMM yyyy") : "Not recorded"}</dd></div><div><dt>Retention review</dt><dd>{review.retention_until ? format(new Date(review.retention_until), "d MMMM yyyy") : "Not scheduled"}</dd></div></dl>
          <div className="member-access-review-actions">
            {cannotArchive ? <p className="member-access-review-protection"><ShieldCheck/>{review.auth_user_id === user.id ? "You cannot archive your own access." : "Demote this administrator before archiving access."}</p> : <details className="danger"><summary><UserX/>Archive portal access</summary><form action={resolveMemberMojoPortalAccessReview} className="stack-form"><input type="hidden" name="membershipRecordId" value={review.id}/><input type="hidden" name="decision" value="archive_access"/><label>Decision reason<textarea name="reason" minLength={10} maxLength={500} defaultValue="Membership was absent from a confirmed complete active-member snapshot." required/><small>Do not include unnecessary sensitive information.</small></label><label>Type <code className="member-import-confirmation-phrase">ARCHIVE PORTAL ACCESS</code> to confirm<input name="confirmation" autoComplete="off" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Archiving access…"><UserX/>Archive access</PendingSubmitButton></form></details>}
            <details><summary><ShieldCheck/>Retain portal access</summary><form action={resolveMemberMojoPortalAccessReview} className="stack-form"><input type="hidden" name="membershipRecordId" value={review.id}/><input type="hidden" name="decision" value="retain_access"/><label>Reason for retaining access<textarea name="reason" minLength={10} maxLength={500} required/><small>Record the operational, legal, insurance or dispute-related reason. Do not include unnecessary sensitive information.</small></label><label>Type <code className="member-import-confirmation-phrase">RETAIN PORTAL ACCESS</code> to confirm<input name="confirmation" autoComplete="off" required/></label><PendingSubmitButton className="button dark" pendingLabel="Saving decision…"><ShieldCheck/>Retain access</PendingSubmitButton></form></details>
          </div>
        </article>;
      })}</div> : <div className="member-access-review-empty"><ShieldCheck/><h3>No portal access reviews</h3><p>Linked accounts requiring a human decision after a complete snapshot will appear here.</p></div>}
      {(count ?? 0) > 100 ? <p className="form-help">Showing the first 100 reviews. Resolve these to reveal the remaining records.</p> : null}
    </section>
    <Link className="back-link" href="/admin/members">← Return to member register</Link>
  </div>;
}
