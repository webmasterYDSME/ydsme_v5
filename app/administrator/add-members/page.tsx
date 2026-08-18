import Link from "next/link";
import { FileUp, UserPlus } from "lucide-react";
import { bulkInviteMembers } from "@/lib/actions/content";

export default async function AddMembers({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Administrator · Bulk tools</p><h1>Invite members by CSV</h1><p>Use columns named <code>email</code> and <code>full_name</code>. Each valid row receives a secure account invitation.</p></div><UserPlus/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">Invitations have been sent.</p> : null}<section className="portal-card"><form action={bulkInviteMembers} className="stack-form"><label>CSV file<input type="file" name="file" accept="text/csv,.csv" required/></label><p className="form-help">Maximum 250 rows and 1 MB. Existing addresses will be reported rather than overwritten.</p><button type="submit" className="button dark"><FileUp/>Send invitations</button></form></section><Link className="back-link" href="/admin/members">← Return to member register</Link></div>;
}
