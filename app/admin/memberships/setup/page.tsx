import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { membershipMode } from "@/lib/features";
import { countMigrationReviews } from "@/lib/membership-admin/records";
import { MembershipPaymentSettings } from "../MembershipPaymentSettings";
import { ImportPanel } from "../_components/ImportPanel";
import { MembershipFlash } from "../_components/MembershipFlash";
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
    { key: "payment", label: "Payment details" },
    { key: "reports", label: "Reports" },
    ...(importAvailable ? [{ key: "import", label: "MemberMojo import", count: reviewCount }] : []),
  ];
  const requested = one(query.tab);
  // Membership types and fees now live on the Renewals tab. Older links and stored notices still say tab=fees.
  if (requested === "fees") {
    const carried = new URLSearchParams();
    for (const key of ["notice", "error"]) { const value = one(query[key]); if (value) carried.set(key, value); }
    redirect(carried.size ? `/admin/memberships/renewals?${carried}` : "/admin/memberships/renewals");
  }
  const tab = tabs.find((item) => item.key === requested)?.key ?? "payment";

  return <>
    <MembershipFlash query={query}/>
    <p className={styles.tabNote}>The treasurer’s payment details, bookkeeping reports, and the one-time MemberMojo import. Membership types and fees are on the Renewals tab.</p>
    <div className={styles.setupLayout}>
      <nav className={styles.subnav} aria-label="Setup sections">
        {tabs.map((item) => <Link key={item.key} href={item.key === "payment" ? "/admin/memberships/setup" : `/admin/memberships/setup?tab=${item.key}`} prefetch={false} aria-current={item.key === tab ? "page" : undefined}>{item.label}{"count" in item && item.count ? <span>{item.count}</span> : null}</Link>)}
      </nav>
      <div>
        {tab === "payment" ? <MembershipPaymentSettings/> : null}
        {tab === "reports" ? <ReportsPanel/> : null}
        {tab === "import" ? <ImportPanel/> : null}
      </div>
    </div>
  </>;
}
