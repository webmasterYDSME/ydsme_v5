import { UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { membershipAdministrationEnabled } from "@/lib/features";
import { PeopleEditorDialog, type PeopleAccount, type CommitteeListing } from "@/app/components/PeopleEditorDialog";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const session = await requireRole(["administrator"]);
  const query = await searchParams;
  if (query.tab !== "committee") redirect("/admin/members");
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const pageSize = 12;
  const admin = createServiceClient();
  const [roster, roles, officers] = await Promise.all([
    admin.from("committees").select("*", { count: "exact" }).order("position").order("id").range((page - 1) * pageSize, page * pageSize - 1),
    admin.from("user_roles").select("user_id,role,users!inner(id,full_name,email,membership_status)").in("role", ["committee", "administrator"]).eq("users.membership_status", "active"),
    admin.from("user_capabilities").select("user_id").eq("capability", "memberships.manage"),
  ]);
  if (roster.error || roles.error || officers.error) throw new Error("Unable to load People.");
  const pages = Math.max(1, Math.ceil((roster.count || 0) / pageSize));
  if (page > pages) redirect(`/admin/people?tab=committee&page=${pages}`);
  const officerIds = new Set((officers.data || []).map(item => item.user_id));
  const accounts: PeopleAccount[] = (roles.data || []).map(row => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return { id: row.user_id, full_name: user.full_name, email: user.email, role: row.role, officer: officerIds.has(row.user_id) };
  });
  const membershipEnabled = membershipAdministrationEnabled();
  return <div className="portal-content">
    <header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>People</h1><p>Manage account access and the public committee roster in one place.</p></div><PeopleEditorDialog accounts={accounts} actorId={session.user.id} membershipEnabled={membershipEnabled}/></header>
    <PortalTabs label="People" tabs={[{ href: "/admin/members", label: "Members", current: false }, { href: "/admin/people?tab=committee", label: "Committee", current: true }]}/>
    <p className="event-step-help">Link existing positions explicitly; names and email addresses are never matched automatically. Lower display-order numbers appear first.</p>
    <div className="admin-list">{(roster.data as CommitteeListing[]).map(listing => {
      const member = accounts.find(account => account.id === listing.user_id);
      return <article key={listing.id}><div><span>{listing.is_public ? "Public" : "Hidden"} · Order {listing.position}</span><h2>{listing.title}</h2><p>{listing.name || "Position vacant"}</p><p>{member ? `Linked account: ${member.full_name || member.email}` : listing.user_id ? "Linked account is inactive — restore it in Members to manage its access." : "No linked website account"}</p>{listing.email && <p>{listing.email}</p>}</div><div className="admin-list-actions">{!listing.user_id || member ? <PeopleEditorDialog listing={listing} accounts={accounts} actorId={session.user.id} membershipEnabled={membershipEnabled} triggerLabel="Manage"/> : <Link href="/admin/members">Find member</Link>}</div></article>;
    })}</div>
    <PortalPagination currentPage={page} totalPages={pages} totalItems={roster.count || 0} itemLabel="positions" href={value => `/admin/people?tab=committee&page=${value}`} ariaLabel="Committee positions"/>
    {!roster.data?.length && <div className="portal-empty-state"><UsersRound aria-hidden="true"/><h2>No committee positions</h2><p>Add a position to get started.</p></div>}
  </div>;
}
