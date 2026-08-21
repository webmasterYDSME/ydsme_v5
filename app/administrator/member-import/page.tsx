import Link from "next/link";
import { format } from "date-fns";
import { Clock, FileUp, ShieldCheck, UserX } from "lucide-react";
import { MemberMojoImportForm } from "@/app/components/MemberMojoImportForm";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { resolveMemberMojoPortalAccessReview } from "@/lib/actions/member-imports";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipMode } from "@/lib/features";
import { redirect } from "next/navigation";

type Query = { error?: string; notice?: string };

const notices: Record<string, string> = {
  "portal-access-archived": "This person can no longer sign in. We saved a record of your decision.",
  "portal-access-retained": "This person can still sign in. We saved a record of your decision.",
};

export default async function MemberImportPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (["live", "drain"].includes(membershipMode())) redirect("/admin/memberships");
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
    <header className="portal-heading"><div><p className="eyebrow dark">Administrator · Member list</p><h1>Update members from MemberMojo</h1><p>Upload the member list you downloaded from MemberMojo. You will see what will change before anything is saved.</p></div><FileUp/></header>
    {query.error ? <p className="form-message error" role="alert">{query.error}</p> : null}
    {query.notice && notices[query.notice] ? <p className="form-message success">{notices[query.notice]}</p> : null}
    <MemberMojoImportForm/>

    <section className="member-access-reviews" aria-labelledby="portal-access-review-heading">
      <header className="member-import-result-heading"><div><p className="eyebrow dark">You need to decide</p><h2 id="portal-access-review-heading">Check who can still sign in</h2><p>MemberMojo says these memberships have ended, but these people still have a website account. Nothing changes until you choose what to do.</p></div><span className="count-badge"><Clock/>{count ?? 0} to check</span></header>
      {(reviews ?? []).length ? <div className="member-access-review-list">{reviews?.map(review => {
        const portalUser = review.auth_user_id ? usersById.get(review.auth_user_id) : undefined;
        const portalRole = review.auth_user_id ? rolesById.get(review.auth_user_id) ?? "member" : "member";
        const cannotArchive = review.auth_user_id === user.id || portalRole === "administrator";
        return <article key={review.id}>
          <div className="member-access-review-summary"><div><span>MemberMojo says the membership has ended</span><h3>{review.first_name} {review.last_name}</h3><p>MemberMojo status: {review.source_state}{review.source_expires_on ? ` · membership ended ${format(new Date(`${review.source_expires_on}T00:00:00Z`), "d MMMM yyyy")}` : ""}</p></div><span className={`member-status is-${portalUser?.membership_status ?? "archived"}`}>{portalUser ? (portalUser.membership_status === "active" ? "can sign in" : portalUser.membership_status === "suspended" ? "sign-in paused" : "sign-in off") : "website account not found"}</span></div>
          <dl><div><dt>Website account</dt><dd>{portalUser?.full_name || "Name not set"}<small>{portalUser?.email}</small></dd></div><div><dt>Website access</dt><dd>{portalRole}</dd></div><div><dt>Membership ended</dt><dd>{review.membership_ended_at ? format(new Date(review.membership_ended_at), "d MMMM yyyy") : "Date not known"}</dd></div><div><dt>Keep details until</dt><dd>{review.retention_until ? format(new Date(review.retention_until), "d MMMM yyyy") : "No date set"}</dd></div></dl>
          <div className="member-access-review-actions">
            {cannotArchive ? <p className="member-access-review-protection"><ShieldCheck/>{review.auth_user_id === user.id ? "You cannot turn off your own sign-in." : "This person is an administrator. Change them to a normal member before turning off sign-in."}</p> : <details className="danger"><summary><UserX/>Turn off website sign-in</summary><form action={resolveMemberMojoPortalAccessReview} className="stack-form"><input type="hidden" name="membershipRecordId" value={review.id}/><input type="hidden" name="decision" value="archive_access"/><label>Why are you turning off sign-in?<textarea name="reason" minLength={10} maxLength={500} defaultValue="This person was not included in the checked list of all current members." required/><small>Write only what is needed to explain your decision.</small></label><label>To make sure this is deliberate, type <code className="member-import-confirmation-phrase">ARCHIVE PORTAL ACCESS</code><input name="confirmation" autoComplete="off" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Turning off sign-in…"><UserX/>Turn off sign-in</PendingSubmitButton></form></details>}
            <details><summary><ShieldCheck/>Keep website sign-in</summary><form action={resolveMemberMojoPortalAccessReview} className="stack-form"><input type="hidden" name="membershipRecordId" value={review.id}/><input type="hidden" name="decision" value="retain_access"/><label>Why should this person still be able to sign in?<textarea name="reason" minLength={10} maxLength={500} required/><small>For example, there may be a MemberMojo mistake, an insurance matter, or an open disagreement. We will ask you to check again in 12 months. Write only what is needed.</small></label><label>To make sure this is deliberate, type <code className="member-import-confirmation-phrase">RETAIN PORTAL ACCESS</code><input name="confirmation" autoComplete="off" required/></label><PendingSubmitButton className="button dark" pendingLabel="Saving your choice…"><ShieldCheck/>Keep sign-in</PendingSubmitButton></form></details>
          </div>
        </article>;
      })}</div> : <div className="member-access-review-empty"><ShieldCheck/><h3>No sign-ins need checking</h3><p>When a full MemberMojo list shows that someone has left but they can still sign in, they will appear here.</p></div>}
      {(count ?? 0) > 100 ? <p className="form-help">The first 100 people are shown. Finish some of these checks to see the rest.</p> : null}
    </section>
    <Link className="back-link" href="/admin/members">← Return to member register</Link>
  </div>;
}
