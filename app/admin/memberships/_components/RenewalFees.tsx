import Link from "next/link";
import { feeInForce } from "@/lib/membership-admin/renewals";
import { money } from "@/lib/membership-admin/format";
import { SidePanel } from "./SidePanel";
import styles from "../memberships.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** The fee to show for a membership type in one year, or null when none has been set. */
export function feeSummary(plans: Row[], prices: Row[], year: number): { name: string; amount: string | null }[] {
  return plans.filter((plan) => plan.active).map((plan) => {
    const fee = feeInForce(prices, plan.id, year);
    return { name: plan.name as string, amount: fee ? money(fee.amount_pence) : null };
  });
}

/**
 * The annual fee for each membership type, with a way to change the fee or the type's details. It opens from the
 * Renewals card as a panel, because fees are looked at rarely and used to sit at the bottom of a long page.
 */
export function RenewalFees({ plans, prices, years, feeHref, typeHref, closeHref }: {
  plans: Row[];
  prices: Row[];
  years: number[];
  feeHref: (planId: string) => string;
  typeHref: (planId: string) => string;
  closeHref: string;
}) {
  return <SidePanel closeHref={closeHref} label="Membership types and fees" eyebrow="Fees" eyebrowClassName={styles.pillPayment} title="Membership types and fees" wide>
    <p className={styles.panelNote}>A fee carries on from year to year. Change it only when the amount changes.</p>
    <div className={styles.feeList}>
      {plans.map((plan) => {
        const setupNeeded = prices.some((price) => price.plan_id === plan.id && !price.stripe_price_id);
        return <article className={styles.feePlan} key={plan.id}>
          <div className={styles.feePlanHead}>
            <div>
              <strong>{plan.name}</strong>
              <small>{plan.minimum_age}–{plan.maximum_age} years{plan.requires_approval ? " · approval needed" : ""}{plan.active ? "" : " · hidden from the application form"}</small>
            </div>
            <div className={styles.feeLinks}>
              <Link className={styles.cardLink} href={feeHref(plan.id)} prefetch={false} scroll={false}>Change fee</Link>
              <Link className={styles.cardLink} href={typeHref(plan.id)} prefetch={false} scroll={false}>Edit type</Link>
            </div>
          </div>
          <dl className={styles.feeYears}>
            {years.map((year) => {
              const fee = feeInForce(prices, plan.id, year);
              return <div key={year}><dt>{year}</dt><dd>{fee ? money(fee.amount_pence) : <em className={styles.warnText}>No fee</em>}</dd></div>;
            })}
          </dl>
          {setupNeeded ? <small className={styles.warnText}>Online payment is not set up for every year. Saving the fee again sets it up.</small> : null}
        </article>;
      })}
    </div>
  </SidePanel>;
}
