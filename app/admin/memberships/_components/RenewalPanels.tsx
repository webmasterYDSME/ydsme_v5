import { configureMembershipPrice, updateMembershipPlan } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { money } from "@/lib/membership-admin/format";
import { feeInForce } from "@/lib/membership-admin/renewals";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const Actions = ({ children }: { children: React.ReactNode }) => <div className={styles.actionRow}><span/>{children}</div>;

/** Sets a new annual fee for one membership type from a chosen year. */
export function FeeChangePanel({ plan, prices, years, defaultYear, affected, closeHref }: {
  plan: Row; prices: Row[]; years: number[]; defaultYear: number; affected: number; closeHref: string;
}) {
  const current = feeInForce(prices, plan.id, defaultYear);
  const history = prices.filter((price) => price.plan_id === plan.id).sort((a, b) => b.membership_year - a.membership_year || b.version - a.version);
  return <SidePanel closeHref={closeHref} label={`Change the ${plan.name} fee`} eyebrow="Fee" eyebrowClassName={styles.pillPayment} title={`Change the ${plan.name} fee`}>
    <dl className={styles.facts}>
      <div><dt>Membership</dt><dd>{plan.name}</dd></div>
      <div><dt>Fee now</dt><dd>{current ? money(current.amount_pence) : "Not set"}</dd></div>
      <div><dt>Members on this type</dt><dd>{affected}</dd></div>
    </dl>
    <form action={configureMembershipPrice} className="editor-form">
      <input type="hidden" name="plan_id" value={plan.id}/>
      <label>Change starts in<select name="membership_year" defaultValue={defaultYear}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label>New annual fee (£)<input name="amount" type="number" min="1" max="10000" step="0.01" defaultValue={current ? current.amount_pence / 100 : ""} required/></label>
      <p className={styles.panelNote}>Fees already paid do not change. Members on this type are told the new price{affected ? ` (${affected} ${affected === 1 ? "member" : "members"})` : ""}, and members who renew by card are switched to it.</p>
      <Actions>
        <PendingSubmitButton pendingLabel="Saving fee…" confirmMessage={`Save this fee and tell the ${affected} ${plan.name} ${affected === 1 ? "member" : "members"} about the new price?`}>Save fee</PendingSubmitButton>
      </Actions>
    </form>
    {history.length ? <div className={styles.factsGroup}>
      <h3 className={styles.factsTitle}>Fee history</h3>
      <dl className={styles.facts}>{history.map((price) => <div key={price.id}><dt>From {price.membership_year}</dt><dd>{money(price.amount_pence)}{price.carried_forward_from_id ? " · carried on" : ""}</dd></div>)}</dl>
    </div> : null}
  </SidePanel>;
}

/** Age limits, description, approval and availability of one membership type. */
export function PlanDetailsPanel({ plan, closeHref }: { plan: Row; closeHref: string }) {
  return <SidePanel closeHref={closeHref} label={`Edit the ${plan.name} membership type`} eyebrow="Membership type" eyebrowClassName={styles.pillMute} title={`Edit ${plan.name}`}>
    <form action={updateMembershipPlan} className="editor-form">
      <input type="hidden" name="plan_id" value={plan.id}/>
      <label>Description<textarea name="description" rows={3} defaultValue={plan.description} required/></label>
      <div className={styles.fieldGrid}>
        <label>Youngest age<input name="minimum_age" type="number" min="0" max="120" defaultValue={plan.minimum_age} required/></label>
        <label>Oldest age<input name="maximum_age" type="number" min="0" max="120" defaultValue={plan.maximum_age} required/></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="requires_approval" defaultChecked={plan.requires_approval}/>Require officer approval for applications</label>
      <label className="checkbox-row"><input type="checkbox" name="active" defaultChecked={plan.active}/>Show this membership type on the application form</label>
      <Actions><PendingSubmitButton pendingLabel="Saving…">Save membership type</PendingSubmitButton></Actions>
    </form>
  </SidePanel>;
}
