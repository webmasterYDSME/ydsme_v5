import Link from "next/link";
import { UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { loadMemberRegister, type RegisterMember } from "@/lib/membership-admin/records";
import { dateLabel, memberStateName } from "@/lib/membership-admin/format";
import { PortalPagination } from "@/app/components/PortalPagination";
import { AddMemberPanel } from "../_components/AddMemberPanel";
import { MembershipFlash } from "../_components/MembershipFlash";
import styles from "../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const PAGE_SIZE = 25;

const groups = [
  { key: "all", label: "All", includes: () => true },
  { key: "active", label: "Active", includes: (member: RegisterMember) => member.state === "active" },
  { key: "attention", label: "Needs attention", includes: (member: RegisterMember) => ["grace", "payment_review"].includes(member.state) },
  { key: "honorary", label: "Honorary", includes: (member: RegisterMember) => member.state === "honorary" },
  { key: "inactive", label: "Not active", includes: (member: RegisterMember) => ["lapsed", "suspended"].includes(member.state) },
] as const;

const stateClass = (state: string) => state === "active" ? styles.pillOk : state === "honorary" ? styles.pillRequest
  : ["grace", "payment_review"].includes(state) ? styles.pillPayment : styles.pillMute;

export default async function MembershipMembers({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  await requireCapability("memberships.manage");
  const members = await loadMemberRegister();

  const q = (one(query.q) || "").trim().toLocaleLowerCase();
  const group = groups.find((item) => item.key === one(query.status)) ?? groups[0];
  const matching = members.filter((member) => !q || member.fullName.toLocaleLowerCase().includes(q) || member.email?.toLocaleLowerCase().includes(q));
  const filtered = matching.filter(group.includes);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(query.page) || "1", 10) || 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const addMode = one(query.add) === "member" || one(query.add) === "honorary" ? (one(query.add) as "member" | "honorary") : null;

  const href = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", one(query.q)!.trim());
    if (group.key !== "all") params.set("status", group.key);
    for (const [key, value] of Object.entries(overrides)) { if (value) params.set(key, value); else params.delete(key); }
    const search = params.toString();
    return search ? `/admin/memberships/members?${search}` : "/admin/memberships/members";
  };

  return <>
    <MembershipFlash query={query}/>
    <p className={styles.tabNote}>Search the register, open someone’s record, or add a person who joined offline.</p>
    <form className={styles.search} method="get">
      {group.key !== "all" ? <input type="hidden" name="status" value={group.key}/> : null}
      <label>Find a membership<input name="q" defaultValue={one(query.q) || ""} placeholder="Name or correspondence email"/></label>
      <button className="button dark">Search</button>
      {q ? <Link className={styles.linkButton} href={href({ q: "", page: "" })}>Clear</Link> : null}
    </form>
    <nav className={styles.chips} aria-label="Filter by status" style={{ marginBottom: 14 }}>
      {groups.map((item) => <Link key={item.key} className={`${styles.chip} ${item.key === group.key ? styles.chipOn : ""}`} href={href({ status: item.key === "all" ? "" : item.key, page: "" })} prefetch={false} aria-current={item.key === group.key ? "true" : undefined}>{item.label}<span>{matching.filter(item.includes).length}</span></Link>)}
    </nav>
    {filtered.length ? <>
      <div className={styles.register}>
        <div className={`${styles.registerRow} ${styles.registerHead}`} aria-hidden="true"><span>Member</span><span>Membership</span><span>Status</span><span>Paid until</span><span/></div>
        {visible.map((member) => <article className={styles.registerRow} key={member.id}>
          <div><strong>{member.fullName}</strong><small>{member.email || "No correspondence email"}</small></div>
          <div className={styles.registerMeta}>
            <span>{member.plan || "—"}</span>
            <span><span className={`${styles.pill} ${stateClass(member.state)}`}>{memberStateName(member.state)}</span></span>
            <span>{member.state === "honorary" ? "Lifetime" : member.paidUntil ? dateLabel(member.paidUntil) : "—"}</span>
          </div>
          <Link className="button outline" href={`/admin/memberships/members/${member.id}`} prefetch={false}>View membership</Link>
        </article>)}
      </div>
      <PortalPagination currentPage={page} totalPages={pages} totalItems={filtered.length} itemLabel="memberships" href={(next) => href({ page: String(next) })} ariaLabel="Membership register pages"/>
    </> : <div className="membership-empty-state"><UsersRound/><strong>No memberships found</strong><p>{members.length ? "Try another name, email address or filter." : "Website accounts and membership records are separate. Add a membership to start the register."}</p></div>}
    <p className={styles.registerNote}>Manage website sign-in accounts in <Link className={styles.linkButton} href="/admin/members">People</Link>.</p>
    {addMode ? <AddMemberPanel mode={addMode} closeHref={href({ add: "" })}/> : null}
  </>;
}
