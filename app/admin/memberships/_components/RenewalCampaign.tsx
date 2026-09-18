import { openRenewalCampaign } from "@/lib/actions/membership-renewals";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { money } from "@/lib/membership-admin/format";
import styles from "../memberships.module.css";

type Plan = {
  id: string;
  name: string;
  membership_plan_prices: { membership_year: number; amount_pence: number; version: number; active: boolean }[];
};

/** Checks the annual fees, then opens renewals and sends the invitations. Paid and honorary members are excluded automatically. */
export function RenewalCampaign({ plans, year }: { plans: Plan[]; year: number }) {
  return <section className={styles.card}>
    <p className={styles.eyebrowNote}>Once a year</p>
    <h2>Open annual renewals</h2>
    <p className={styles.lead}>Check the annual fees before sending invitations. Paid and honorary members are excluded automatically.</p>
    <table className={styles.feeTable}>
      <caption>Annual membership fees</caption>
      <thead><tr><th>Membership</th><th>{year}</th><th>{year + 1}</th></tr></thead>
      <tbody>{plans.map((plan) => <tr key={plan.id}><th scope="row">{plan.name}</th>{[year, year + 1].map((feeYear) => {
        const price = plan.membership_plan_prices.filter((item) => item.active && item.membership_year <= feeYear).sort((a, b) => b.membership_year - a.membership_year || b.version - a.version)[0];
        return <td key={feeYear}>{price ? money(price.amount_pence) : "Not configured"}</td>;
      })}</tr>)}</tbody>
    </table>
    <form action={openRenewalCampaign} className="editor-form" style={{ marginTop: 18 }}>
      <label>Membership year<select name="membership_year"><option>{year + 1}</option><option>{year}</option></select></label>
      <PendingSubmitButton>Open renewals and send invitations</PendingSubmitButton>
    </form>
  </section>;
}
