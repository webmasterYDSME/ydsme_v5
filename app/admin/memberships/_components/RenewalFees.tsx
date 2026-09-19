import Link from "next/link";
import { feeInForce } from "@/lib/membership-admin/renewals";
import { money } from "@/lib/membership-admin/format";
import styles from "../memberships.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** The annual fee for each membership type, with a way to change the fee or the type's details. */
export function RenewalFees({ plans, prices, years, feeHref, typeHref }: {
  plans: Row[];
  prices: Row[];
  years: number[];
  feeHref: (planId: string) => string;
  typeHref: (planId: string) => string;
}) {
  return <section className={styles.card}>
    <h2>Membership types and fees</h2>
    <p className={styles.lead}>A fee carries on from year to year. Change it only when the amount changes.</p>
    <div className={styles.register} style={{ marginTop: 14 }}>
      <div className={`${styles.feeRow} ${styles.registerHead}`} aria-hidden="true"><span>Membership</span>{years.map((year) => <span key={year}>{year}</span>)}<span/></div>
      {plans.map((plan) => {
        const setupNeeded = prices.some((price) => price.plan_id === plan.id && !price.stripe_price_id);
        return <article className={styles.feeRow} key={plan.id}>
          <div>
            <strong>{plan.name}</strong>
            <small>{plan.minimum_age}–{plan.maximum_age} years{plan.requires_approval ? " · approval needed" : ""}{plan.active ? "" : " · hidden from the application form"}</small>
            {setupNeeded ? <small className={styles.warnText}>Online payment is not set up for every year. Saving the fee again sets it up.</small> : null}
          </div>
          <div className={styles.registerMeta}>
            {years.map((year) => {
              const fee = feeInForce(prices, plan.id, year);
              return <span key={year}>{fee ? money(fee.amount_pence) : <em className={styles.warnText}>No fee</em>}</span>;
            })}
          </div>
          <div className={styles.feeLinks}>
            <Link className={styles.cardLink} href={feeHref(plan.id)} prefetch={false} scroll={false}>Change fee</Link>
            <Link className={styles.cardLink} href={typeHref(plan.id)} prefetch={false} scroll={false}>Edit type</Link>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
