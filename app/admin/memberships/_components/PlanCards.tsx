import { ChevronDown } from "lucide-react";
import { configureMembershipPrice, updateMembershipPlan } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { money } from "@/lib/membership-admin/format";
import styles from "../memberships.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function PlanCards({ plans, prices }: { plans: Row[]; prices: Row[] }) {
  return <section className={styles.card}>
    <h2>Membership types and annual fees</h2>
    <p className={styles.lead}>The current fee continues automatically each year. Add a fee change only when the amount needs to change.</p>
    <div className="membership-plan-admin-grid">{plans.map((plan) => {
      const planPrices = prices.filter((item) => item.plan_id === plan.id);
      const latestPrice = planPrices[0];
      const onlineSetupNeeded = planPrices.some((item) => !item.stripe_price_id);
      return <article className="membership-plan-card" key={plan.id}>
        <header className="membership-plan-card-header">
          <div><h3>{plan.name}</h3><p>{plan.minimum_age}–{plan.maximum_age} years · {plan.requires_approval ? "Officer approval required" : "No officer approval"}</p></div>
          <span className={plan.active ? "is-ready" : "is-inactive"}>{plan.active ? "Available" : "Hidden"}</span>
        </header>
        <div className="membership-plan-card-summary">
          <div className="membership-plan-summary-heading"><div><h4>Annual fees</h4><p>The latest fee remains in force until a change starts.</p></div>{planPrices.length ? <span className={onlineSetupNeeded ? "needs-setup" : "is-ready"}>{onlineSetupNeeded ? "Setup needed" : "Online ready"}</span> : null}</div>
          {planPrices.length ? <div className="membership-plan-fee-list">{planPrices.map((price) => <div className="membership-plan-fee-row" key={price.id}><span>{price.membership_year}</span><strong>{money(price.amount_pence)}</strong><small className={price.stripe_price_id ? "is-ready" : "needs-setup"}>{price.stripe_price_id ? price.carried_forward_from_id ? "Continued" : "Officer set" : "Needs setup"}</small></div>)}</div> : <p className="membership-plan-no-fee">No annual fee has been set.</p>}
        </div>
        <form action={configureMembershipPrice} className="editor-form membership-price-form"><h4>Change the annual fee</h4><input type="hidden" name="plan_id" value={plan.id}/><div className="form-grid"><label>Change starts in<input name="membership_year" type="number" min={new Date().getUTCFullYear()} defaultValue={new Date().getUTCFullYear() + 1} required/></label><label>New annual fee (£)<input name="amount" type="number" min="1" max="10000" step="0.01" defaultValue={latestPrice ? latestPrice.amount_pence / 100 : ""} required/></label></div><small>Use this only when the amount changes. The existing fee continues automatically until this membership year begins. Previous fees and payments remain unchanged.</small><PendingSubmitButton className="button dark" pendingLabel="Saving change…">Save fee change</PendingSubmitButton></form>
        <details className="membership-plan-settings">
          <summary><span><strong>Edit membership details</strong><small>Age limits, approval and availability</small></span><ChevronDown aria-hidden="true"/></summary>
          <form action={updateMembershipPlan} className="editor-form"><input type="hidden" name="plan_id" value={plan.id}/><label>Description<textarea name="description" defaultValue={plan.description} required/></label><div className="form-grid"><label>Youngest age<input name="minimum_age" type="number" min="0" max="120" defaultValue={plan.minimum_age} required/></label><label>Oldest age<input name="maximum_age" type="number" min="0" max="120" defaultValue={plan.maximum_age} required/></label></div><label className="checkbox-row"><input type="checkbox" name="requires_approval" defaultChecked={plan.requires_approval}/>Require officer approval for applications</label><label className="checkbox-row"><input type="checkbox" name="active" defaultChecked={plan.active}/>Show this membership type on the application form</label><PendingSubmitButton className="button outline" pendingLabel="Saving…">Save membership details</PendingSubmitButton></form>
        </details>
      </article>;
    })}</div>
  </section>;
}
