import { resolveMembershipMigrationReview, stageMemberMojoCutover } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { reviewKindName } from "@/lib/membership-admin/format";
import { loadMigrationReviews } from "@/lib/membership-admin/records";
import styles from "../memberships.module.css";

export async function ImportPanel() {
  const reviews = await loadMigrationReviews();
  return <section className={`${styles.card} membership-import-section`}>
    <span className={`${styles.pill} ${styles.pillContact}`}>Migration only</span>
    <h2 style={{ marginTop: 10 }}>Import the final MemberMojo list</h2>
    <p className={styles.lead}>Run this once after the final MemberMojo export. Existing people are not added twice, and uncertain records are listed for review. This section disappears once membership is live and nothing is left to review.</p>
    <form action={stageMemberMojoCutover} style={{ marginTop: 18 }}><PendingSubmitButton className="button outline" pendingLabel="Preparing import…">Prepare final import</PendingSubmitButton></form>
    {reviews.length ? <div className="membership-queue-list">{reviews.map((review) => <article key={review.id}><div><strong>{reviewKindName(review.review_kind)}</strong><p>{review.summary}</p><small>MemberMojo record {review.membership_record_id}</small>{review.review_kind === "shared_email" || review.review_kind === "portal_conflict" ? <p className="form-help">Confirm a unique personal login in the member history, or record that this person will receive membership emails without having an online account.</p> : null}</div><form action={resolveMembershipMigrationReview} className="stack-form"><input type="hidden" name="review_id" value={review.id}/><label>Decision<select name="status"><option value="resolved">Reviewed and resolved</option><option value="dismissed">Not a genuine conflict</option></select></label><label>What was decided?<textarea name="resolution" minLength={8} maxLength={500} required/></label><PendingSubmitButton pendingLabel="Saving review…">Save review decision</PendingSubmitButton></form></article>)}</div> : <p className="membership-section-note">There are no imported records waiting for review.</p>}
  </section>;
}
