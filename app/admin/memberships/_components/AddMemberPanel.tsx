import Link from "next/link";
import { createHonoraryMember } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { londonToday } from "@/lib/membership-admin/format";
import { loadPlansAndPrices } from "@/lib/membership-admin/records";
import { AddMemberForm } from "./AddMemberForm";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

/** Adds someone who applied in person, or a new honorary member, in a side panel over the register. */
export async function AddMemberPanel({ mode, closeHref }: { mode: "member" | "honorary"; closeHref: string }) {
  const today = londonToday();
  const nextYearStart = `${Number(today.slice(0, 4)) + 1}-01-01`;
  const { plans, prices } = mode === "member" ? await loadPlansAndPrices() : { plans: [], prices: [] };
  return <SidePanel wide key={mode} closeHref={closeHref} label="Add a member" eyebrow="Offline application" eyebrowClassName={styles.pillMute} title={mode === "member" ? "Add a membership" : "Add an honorary member"}>
    <nav className={styles.chips} aria-label="Type of member">
      <Link className={`${styles.chip} ${mode === "member" ? styles.chipOn : ""}`} href="/admin/memberships/members?add=member" prefetch={false} aria-current={mode === "member" ? "true" : undefined}>Regular membership</Link>
      <Link className={`${styles.chip} ${mode === "honorary" ? styles.chipOn : ""}`} href="/admin/memberships/members?add=honorary" prefetch={false} aria-current={mode === "honorary" ? "true" : undefined}>Lifetime honorary</Link>
    </nav>
    {mode === "member" ? <>
      <p className={styles.panelNote}>For someone who applied in person or cannot use the online application. Their membership type and amount due are worked out from their date of birth and start date.</p>
      <AddMemberForm
        today={today}
        closeHref={closeHref}
        plans={plans.filter((plan) => plan.active).map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name, minimum_age: plan.minimum_age, maximum_age: plan.maximum_age }))}
        prices={prices.map((price) => ({ plan_id: price.plan_id, membership_year: price.membership_year, amount_pence: price.amount_pence }))}
      />
    </> : <>
      <p className={styles.panelNote}>Payment-free lifetime membership. Every change needs a reason and is kept in the member’s history.</p>
      <form action={createHonoraryMember} className="stack-form">
        <label>Full name<input name="full_name" required/></label>
        <div className={styles.fieldGrid}><label>Email address <em>Optional</em><input name="contact_email" type="email"/></label><label>Telephone number <em>Optional</em><input name="contact_number"/></label></div>
        <label>Start date<input name="effective_from" type="date" min={today} defaultValue={nextYearStart} required/></label>
        <label>Reason for honorary membership<textarea name="reason" rows={3} minLength={5} maxLength={500} required/></label>
        <div className={styles.actionRow}><span/><PendingSubmitButton pendingLabel="Adding…">Add honorary member</PendingSubmitButton></div>
      </form>
    </>}
  </SidePanel>;
}
