import Link from "next/link";
import { UserPlus } from "lucide-react";
import { BulkInviteForm } from "@/app/components/BulkInviteForm";

export default async function AddMembers({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Administrator · Bulk tools</p><h1>Invite members by CSV</h1><p>Use columns named <code>email</code> and <code>full_name</code>. Review the preview before invitations are sent.</p></div><UserPlus/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">Invitations have been sent.</p> : null}<section className="portal-card"><BulkInviteForm/></section><Link className="back-link" href="/admin/members">← Return to member register</Link></div>;
}
