import Link from "next/link";
import { FileWarning, ShieldAlert } from "lucide-react";
import { bulkDeleteMembers } from "@/lib/actions/content";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export default async function DeleteMembers({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Administrator · Bulk lifecycle</p><h1>Archive members by CSV</h1><p>This immediately removes matching members’ portal access while preserving their Supabase Auth accounts and recoverable Society records. Administrators and your own account are excluded.</p></div><ShieldAlert/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">The requested matching members were archived.</p> : null}<section className="portal-card danger-panel"><form action={bulkDeleteMembers} className="stack-form"><label>CSV file<input type="file" name="file" accept="text/csv,.csv" required/></label><label>Type ARCHIVE MEMBERS to confirm<input name="confirmation" autoComplete="off" required/></label><p className="form-help">The file must contain <code>email</code> and <code>full_name</code> columns, with no more than 250 rows.</p><PendingSubmitButton className="button danger-solid" pendingLabel="Archiving…"><FileWarning/>Archive matching members</PendingSubmitButton></form></section><Link className="back-link" href="/admin/members">← Return to member register</Link></div>;
}
