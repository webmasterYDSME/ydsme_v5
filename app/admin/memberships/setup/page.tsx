import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { membershipMode } from "@/lib/features";
import { countMigrationReviews, loadPlansAndPrices } from "@/lib/membership-admin/records";
import { MembershipPaymentSettings } from "../MembershipPaymentSettings";
import { ImportPanel } from "../_components/ImportPanel";
import { MembershipFlash } from "../_components/MembershipFlash";
import { PlanCards } from "../_components/PlanCards";
import { ReportsPanel } from "../_components/ReportsPanel";
import styles from "../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function MembershipSetup({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  await requireCapability("memberships.manage");
  const reviewCount = await countMigrationReviews();
  // The one-off MemberMojo import is only offered until membership is live and every imported record is reviewed.
  const importAvailable = membershipMode() !== "live" || reviewCount > 0;
  const tabs = [
    { key: "fees", label: "Types and fees" },
    { key: "payment", label: "Payment details" },
    { key: "reports", label: "Reports" },
    ...(importAvailable ? [{ key: "import", label: "MemberMojo import", count: reviewCount }] : []),
  ];
  const requested = one(query.tab);
  const tab = tabs.find((item) => item.key === requested)?.key ?? "fees";

  return <>
    <MembershipFlash query={query}/>
    <section className={styles.intro}>
      <p className="eyebrow dark">Membership setup</p>
      <h2>Settings that rarely change</h2>
      <p>Annual fees and membership types, the treasurer’s payment details, bookkeeping reports, and the one-time MemberMojo import.</p>
    </section>
    <div className={styles.setupLayout}>
      <nav className={styles.subnav} aria-label="Setup sections">
        {tabs.map((item) => <Link key={item.key} href={item.key === "fees" ? "/admin/memberships/setup" : `/admin/memberships/setup?tab=${item.key}`} prefetch={false} aria-current={item.key === tab ? "page" : undefined}>{item.label}{"count" in item && item.count ? <span>{item.count}</span> : null}</Link>)}
      </nav>
      <div>
        {tab === "fees" ? <FeesTab/> : null}
        {tab === "payment" ? <MembershipPaymentSettings/> : null}
        {tab === "reports" ? <ReportsPanel/> : null}
        {tab === "import" ? <ImportPanel/> : null}
      </div>
    </div>
  </>;
}

async function FeesTab() {
  const { plans, prices } = await loadPlansAndPrices();
  return <PlanCards plans={plans} prices={prices}/>;
}
