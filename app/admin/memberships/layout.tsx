import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { membershipAdministrationEnabled } from "@/lib/features";
import { countInboxTasks } from "@/lib/membership-admin/inbox";
import { countMigrationReviews } from "@/lib/membership-admin/records";
import { MembershipNav } from "./_components/MembershipNav";
import styles from "./memberships.module.css";

export const dynamic = "force-dynamic";

export default async function MembershipLayout({ children }: { children: ReactNode }) {
  if (!membershipAdministrationEnabled()) redirect("/administrator/member-import");
  await requireCapability("memberships.manage");
  const [inboxCount, reviewCount] = await Promise.all([countInboxTasks(), countMigrationReviews()]);
  return <div className={`portal-content membership-admin-page ${styles.workspace}`}>
    <header className={`portal-heading ${styles.heading}`}>
      <div><p className="eyebrow dark">Membership team</p><h1>Manage memberships</h1><p>Review applications, record payments and member registrations.</p></div>
      <Link className="button dark" href="/admin/memberships/members?add=member"><UserPlus/>Add membership</Link>
    </header>
    {reviewCount > 0 ? <p className="form-message error">Website membership cannot be moved to live public use until {reviewCount} imported record{reviewCount === 1 ? "" : "s"} have been reviewed. <Link href="/admin/memberships/setup?tab=import">Review imported records</Link>.</p> : null}
    <MembershipNav inboxCount={inboxCount} setupCount={reviewCount}/>
    {children}
  </div>;
}
