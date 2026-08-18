import Link from "next/link";
import { FileWarning, ShieldAlert } from "lucide-react";
import { bulkDeleteMembers } from "@/lib/actions/content";

export default async function DeleteMembers({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Administrator · Destructive tool</p><h1>Delete members by CSV</h1><p>This permanently removes matching Supabase Auth accounts and their linked Society records. Your own administrator account is always excluded.</p></div><ShieldAlert/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">The requested matching members were deleted.</p> : null}<section className="portal-card danger-panel"><form action={bulkDeleteMembers} className="stack-form"><label>CSV file<input type="file" name="file" accept="text/csv,.csv" required/></label><label>Type DELETE MEMBERS to confirm<input name="confirmation" autoComplete="off" required/></label><p className="form-help">The file must contain <code>email</code> and <code>full_name</code> columns, with no more than 250 rows.</p><button type="submit" className="button danger-solid"><FileWarning/>Permanently delete matching members</button></form></section><Link className="back-link" href="/admin/members">← Return to member register</Link></div>;
}
