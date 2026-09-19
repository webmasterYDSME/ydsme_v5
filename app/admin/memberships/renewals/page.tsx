import { requireCapability } from "@/lib/auth";
import { londonToday, memberStateName } from "@/lib/membership-admin/format";
import { loadRenewalWorkspace } from "@/lib/membership-admin/records";
import { OfficerRenewalPaymentForm } from "../OfficerRenewalPaymentForm";
import { MembershipFlash } from "../_components/MembershipFlash";
import { RenewalCampaign } from "../_components/RenewalCampaign";
import styles from "../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

export default async function MembershipRenewals({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  await requireCapability("memberships.manage");
  const { currentYear, plans, renewable, choices } = await loadRenewalWorkspace();
  return <>
    <MembershipFlash query={query}/>
    <p className={styles.tabNote}>Open the yearly renewal campaign, or record a payment made by cash, bank transfer or cheque. Payments still waiting for you appear in the Inbox.</p>
    <div className={styles.twoCol}>
      <RenewalCampaign plans={plans} year={currentYear}/>
      <section className={styles.card} id="renewals">
        <p className={styles.eyebrowNote}>Paid another way</p>
        <h2>Record a renewal payment</h2>
        <p className={styles.lead}>Record a full payment made by cash, bank transfer or cheque. The exact amount is shown before saving, and automatic online renewal is switched off to prevent a second charge. It is quicker to start from the member’s own page when you already know who paid.</p>
        {renewable.length
          ? <OfficerRenewalPaymentForm members={renewable.map((member) => ({ id: member.id, full_name: member.full_name, state_label: memberStateName(member.effective_state) }))} choices={choices} currentYear={currentYear} today={londonToday()}/>
          : <p className={styles.panelNote} style={{ marginTop: 14 }}>There are no members whose membership can be renewed here yet.</p>}
      </section>
    </div>
  </>;
}
