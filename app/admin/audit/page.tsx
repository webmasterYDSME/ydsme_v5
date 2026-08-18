import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;

type Query = { q?: string; action?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [params] = await Promise.all([searchParams, requireCapability("audit.view")]);
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const q = safeSearchTerm(params.q);
  const action = safeSearchTerm(params.action);
  let query = createAdminClient().from("audit_logs").select("id,occurred_at,actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state", { count: "exact" });
  if (q) query = query.or(`entity_id.ilike.%${q}%,summary.ilike.%${q}%,entity_type.ilike.%${q}%`);
  if (action) query = query.ilike("action", `%${action}%`);
  const { data: entries, count, error } = await query.order("occurred_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load audit history.");
  const actorIds = [...new Set((entries ?? []).flatMap((entry) => entry.actor_user_id ? [entry.actor_user_id] : []))];
  const actorResult = actorIds.length ? await createAdminClient().from("users").select("id,full_name,email").in("id", actorIds) : { data: [] };
  const actors = new Map((actorResult.data ?? []).map((actor) => [actor.id, actor]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (value: number) => `/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(action ? { action } : {}), page: String(value) })}`;
  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>Audit history</h1><p>Append-only history of security-sensitive and administrative changes. Values are redacted before storage.</p></div><ShieldCheck/></header>
    <form className="booking-search" method="get"><label>Entity, identifier or summary<div><Search/><input name="q" defaultValue={q}/></div></label><label>Action contains<input name="action" defaultValue={action} placeholder="member.role-changed"/></label><button className="button dark" type="submit">Filter</button></form>
    <div className="admin-list audit-list">{(entries ?? []).map((entry) => { const actor = entry.actor_user_id ? actors.get(entry.actor_user_id) : null; return <article key={entry.id}><div><span>{new Date(entry.occurred_at).toLocaleString("en-GB")}</span><h2>{entry.action}</h2><p>{entry.entity_type} · {entry.entity_id}</p></div><div><strong>{actor?.full_name || actor?.email || entry.actor_role}</strong><small>{entry.summary}</small></div>{entry.before_state || entry.after_state ? <details><summary>Redacted changes</summary><pre>{JSON.stringify({ before: entry.before_state, after: entry.after_state }, null, 2)}</pre></details> : null}</article>; })}</div>
    {!entries?.length ? <div className="empty-state"><h2>No matching audit entries</h2></div> : null}
    {pages > 1 ? <nav className="pagination">{page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span/>}<span>Page {page} of {pages} · {count} entries</span>{page < pages ? <Link href={pageHref(page + 1)}>Next</Link> : <span/>}</nav> : null}
  </div>;
}
