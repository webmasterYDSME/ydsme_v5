import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdministrator, requireCapability } from "@/lib/auth";
import { MembershipPaymentSettings } from "../MembershipPaymentSettings";
import { MembershipFlash } from "../_components/MembershipFlash";
import { ReportsPanel } from "../_components/ReportsPanel";
import { RetentionPanel } from "../_components/RetentionPanel";
import styles from "../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function MembershipSetup({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const { role } = await requireCapability("memberships.manage");
  const tabs = [
    { key: "payment", label: "Payment details" },
    { key: "reports", label: "Reports" },
    { key: "retention", label: "Old records" },
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
    <MembershipFlash/>
    <p className={styles.tabNote}>The treasurer’s payment details, bookkeeping reports and removing old member records. Membership types and fees are on the Renewals tab.</p>
    <div className={styles.setupLayout}>
      <nav className={styles.subnav} aria-label="Setup sections">
        {tabs.map((item) => <Link key={item.key} href={item.key === "payment" ? "/admin/memberships/setup" : `/admin/memberships/setup?tab=${item.key}`} prefetch={false} aria-current={item.key === tab ? "page" : undefined}>{item.label}</Link>)}
      </nav>
      <div>
        {tab === "payment" ? <MembershipPaymentSettings/> : null}
        {tab === "reports" ? <ReportsPanel/> : null}
        {tab === "retention" ? <RetentionPanel canSwitch={isAdministrator(role)}/> : null}
      </div>
    </div>
  </>;
}
