import Link from "next/link";
import { format } from "date-fns";
import { FileUp } from "lucide-react";
import { MemberMojoImportForm, SendInvitationsPanel } from "@/app/components/MemberMojoImportForm";
import { requireRole } from "@/lib/auth";
import { membershipMode } from "@/lib/features";
import { getMemberInvitationStatus } from "@/lib/membermojo";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function MemberImportPage() {
  await requireRole(["administrator"]);
  const [invitations, lastImport] = await Promise.all([
    getMemberInvitationStatus(),
    createAdminClient().from("audit_logs").select("occurred_at,summary").eq("action", "membermojo.list-imported")
      .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const membermojoRuns = membershipMode() === "membermojo";

  return <div className="portal-content">
    <header className="portal-heading"><div><p className="eyebrow dark">Administrator · Member list</p><h1>Update members from MemberMojo</h1><p>Upload the member list you downloaded from MemberMojo. Everyone in it becomes a full member for the current year. You will see what will happen before anything is saved.</p></div><FileUp/></header>
    {membermojoRuns ? <p className="form-message">MemberMojo is still the membership system. Until the website takes over, its apply and renew pages send people to MemberMojo and the membership area is hidden. Importing the list keeps the website register and sign-ins up to date.</p> : null}
    {lastImport.data ? <p className="form-help">Last import: {format(new Date(lastImport.data.occurred_at), "d MMMM yyyy 'at' HH:mm")}. {lastImport.data.summary}</p> : null}
    <MemberMojoImportForm/>
    <SendInvitationsPanel status={invitations}/>
    <Link className="back-link" href="/admin/members">← Return to member register</Link>
  </div>;
}
