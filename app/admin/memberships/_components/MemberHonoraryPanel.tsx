import { grantHonoraryMembership, revokeHonoraryMembership } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { dateLabel, londonToday } from "@/lib/membership-admin/format";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

/** Makes the member a lifetime honorary member, or schedules the end of their honorary membership. */
export function MemberHonoraryPanel({ mode, memberId, name, planName, honorary, plans, closeHref }: {
  mode: "grant" | "end";
  memberId: string;
  name: string;
  planName: string | null;
  honorary: { id: string; effective_from: string } | null;
  plans: Array<{ id: string; name: string }>;
  closeHref: string;
}) {
  const today = londonToday();
  const nextYearStart = `${Number(today.slice(0, 4)) + 1}-01-01`;
  const facts = <dl className={styles.facts}>
    <div><dt>Member</dt><dd>{name}</dd></div>
    <div><dt>{mode === "grant" ? "Membership" : "Honorary since"}</dt><dd>{mode === "grant" ? planName || "Not set" : honorary ? dateLabel(honorary.effective_from) : "—"}</dd></div>
  </dl>;
  if (mode === "grant") {
    return <SidePanel closeHref={closeHref} label={`Make ${name} an honorary member`} eyebrow="Honorary" eyebrowClassName={styles.pillRequest} title="Make honorary">
      {facts}
      <p className={styles.panelNote}>Payment-free lifetime membership.</p>
      <form action={grantHonoraryMembership} className="editor-form">
        <input type="hidden" name="member_id" value={memberId}/>
        <label>Start date<input name="effective_from" type="date" min={today} defaultValue={today} required/></label>
        <label>Reason for honorary membership<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
        <div className={styles.actionRow}><span/><PendingSubmitButton pendingLabel="Saving…">Make honorary</PendingSubmitButton></div>
      </form>
    </SidePanel>;
  }
  return <SidePanel closeHref={closeHref} label={`End ${name}’s honorary membership`} eyebrow="Honorary" eyebrowClassName={styles.pillRequest} title="End honorary membership">
    {facts}
    <p className={styles.panelNote}>Choose the membership they move to, and the date the change takes effect.</p>
    <form action={revokeHonoraryMembership} className="editor-form">
      <input type="hidden" name="honorary_id" value={honorary?.id ?? ""}/>
      <label>Membership after honorary status<select name="replacement_plan_id" required>{plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label>Change date<input name="effective_on" type="date" min={today} defaultValue={nextYearStart} required/></label>
      <label>Reason for ending honorary membership<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
      <div className={styles.actionRow}><span/><PendingSubmitButton pendingLabel="Saving…">Schedule the change</PendingSubmitButton></div>
    </form>
  </SidePanel>;
}
