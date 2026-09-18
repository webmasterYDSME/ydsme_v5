import Link from "next/link";
import { Download } from "lucide-react";
import { requestMembershipReportExport } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { loadReportExports } from "@/lib/membership-admin/records";
import styles from "../memberships.module.css";

export async function ReportsPanel() {
  const reportExports = await loadReportExports();
  return <section className={styles.card}>
    <h2>Membership reports</h2>
    <p className={styles.lead}>Reports are prepared in the background and remain available for 24 hours. Each download includes the membership records, a summary and financial totals.</p>
    <form action={requestMembershipReportExport} style={{ margin: "18px 0" }}><PendingSubmitButton className="button dark" pendingLabel="Preparing report…"><Download/>Prepare records download</PendingSubmitButton></form>
    <div className="membership-queue-list">{reportExports.map((report) => <article key={report.id}><div><strong>{report.status === "ready" ? "Complete membership records" : report.status === "failed" ? "Report needs retrying" : "Report is being prepared"}</strong><span>Requested {new Date(report.created_at).toLocaleString("en-GB")}</span><small>{report.status === "ready" ? `Ready until ${new Date(report.expires_at!).toLocaleString("en-GB")}` : report.last_error || "Large registers may take a few minutes."}</small></div>{report.status === "ready" ? <Link className="button outline" href={`/admin/memberships/export?id=${report.id}`}>Download records</Link> : null}</article>)}{!reportExports.length ? <div className="membership-empty-state"><Download/><strong>No reports prepared yet</strong><p>Use “Prepare records download” above when bookkeeping or legal records are needed.</p></div> : null}</div>
  </section>;
}
