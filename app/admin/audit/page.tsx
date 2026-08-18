import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;

type Query = { q?: string; action?: string; category?: string; page?: string };

const auditCategories = {
  members: ["member", "member-invitation", "member-import"],
  content: ["event", "workshop", "workshop-reservation", "announcement", "notice", "document"],
  transactions: ["event_booking", "stripe_event"],
  site: ["site-config", "committee-record"],
} as const;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [params] = await Promise.all([searchParams, requireCapability("audit.view")]);
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const q = safeSearchTerm(params.q);
  const action = safeSearchTerm(params.action);
  const category = Object.hasOwn(auditCategories, params.category || "") ? params.category as keyof typeof auditCategories : "all";
  let query = createAdminClient().from("audit_logs").select("id,occurred_at,actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state", { count: "exact" });
  if (category !== "all") query = query.in("entity_type", [...auditCategories[category]]);
  if (q) query = query.or(`entity_id.ilike.%${q}%,summary.ilike.%${q}%,entity_type.ilike.%${q}%`);
  if (action) query = query.ilike("action", `%${action}%`);
  const { data: entries, count, error } = await query.order("occurred_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load audit history.");
  const actorIds = [...new Set((entries ?? []).flatMap((entry) => entry.actor_user_id ? [entry.actor_user_id] : []))];
  const actorResult = actorIds.length ? await createAdminClient().from("users").select("id,full_name,email").in("id", actorIds) : { data: [] };
  const actors = new Map((actorResult.data ?? []).map((actor) => [actor.id, actor]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (value: number) => `/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(action ? { action } : {}), ...(category !== "all" ? { category } : {}), page: String(value) })}`;
  const categoryHref = (value: string) => `/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(action ? { action } : {}), ...(value !== "all" ? { category: value } : {}) })}`;
  const hasFilters = Boolean(q || action);

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>Audit history</h1><p>Review the append-only record of security-sensitive and administrative changes. Stored values are redacted.</p></div><span className="count-badge"><ShieldCheck/>{count ?? 0} matching</span></header>
    <PortalTabs label="Audit category" tabs={[
      { href: categoryHref("all"), label: "All activity", current: category === "all" },
      { href: categoryHref("members"), label: "Members", current: category === "members" },
      { href: categoryHref("content"), label: "Content", current: category === "content" },
      { href: categoryHref("transactions"), label: "Bookings & payments", current: category === "transactions" },
      { href: categoryHref("site"), label: "Committee & site", current: category === "site" },
    ]}/>
    <form className="portal-filter-panel" method="get"><input type="hidden" name="category" value={category === "all" ? "" : category}/><div className="portal-filter-heading"><div><h2>Search the record</h2><p>Find an entity, identifier, summary or exact family of actions.</p></div>{hasFilters ? <Link className="portal-filter-clear" href={categoryHref(category)} >Clear search</Link> : null}</div><div className="portal-filter-grid audit-filter-grid"><label className="portal-filter-search">Entity, identifier or summary<span><Search/><input name="q" defaultValue={q} placeholder="Member email or record ID" autoComplete="off"/></span></label><label>Action contains<input name="action" defaultValue={action} placeholder="member.role-changed" autoComplete="off"/></label><button className="button dark" type="submit">Filter history</button></div></form>
    <div className="audit-list">{(entries ?? []).map((entry) => { const actor = entry.actor_user_id ? actors.get(entry.actor_user_id) : null; const actorName = actor?.full_name || actor?.email || (entry.actor_role === "system" ? "Automated system" : entry.actor_role); return <article className="audit-entry" key={entry.id}><div className="audit-entry-main"><div className="audit-entry-meta"><time dateTime={entry.occurred_at}>{new Date(entry.occurred_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time><span>{entry.entity_type.replaceAll("_", " ")}</span></div><h2>{entry.action}</h2><p>{entry.summary || "No additional summary was recorded."}</p><code>{entry.entity_id}</code></div><div className="audit-entry-actor"><span>Performed by</span><strong>{actorName}</strong><small>{entry.actor_role}</small></div>{entry.before_state || entry.after_state ? <details className="audit-changes"><summary>View redacted changes</summary><pre>{JSON.stringify({ before: entry.before_state, after: entry.after_state }, null, 2)}</pre></details> : <span className="audit-no-changes">No value changes</span>}</article>; })}</div>
    {!entries?.length ? <div className="empty-state"><h2>No matching audit entries</h2></div> : null}
    <PortalPagination currentPage={page} totalPages={pages} totalItems={count ?? 0} itemLabel="entries" href={pageHref} ariaLabel="Audit history pages"/>
  </div>;
}
