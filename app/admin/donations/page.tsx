import Link from "next/link";
import { Download, HeartHandshake, Settings } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type Query = { campaign?: string; from?: string; to?: string; page?: string };

function validDate(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value! : null;
}

function pageLink(query: Query, page: number) {
  const params = new URLSearchParams();
  if (query.campaign) params.set("campaign", query.campaign);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  params.set("page", String(page));
  return `/admin/donations?${params}`;
}

export default async function DonationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query] = await Promise.all([searchParams, requireCapability("donations.view")]);
  const campaign = ["generic", "target"].includes(query.campaign || "") ? query.campaign! : null;
  const from = validDate(query.from);
  const to = validDate(query.to);
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const admin = createAdminClient();
  let base = admin.from("donation_payments").select("id,paid_at,campaign,amount_pence,refunded_pence,currency,payment_status,stripe_checkout_session_id,stripe_payment_intent_id", { count: "exact" });
  if (campaign) base = base.eq("campaign", campaign);
  if (from) base = base.gte("paid_at", `${from}T00:00:00.000Z`);
  if (to) base = base.lt("paid_at", `${to}T23:59:59.999Z`);
  const { data: payments, count, error } = await base.order("paid_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load the donation ledger.");

  let totalsQuery = admin.from("donation_payments").select("campaign,amount_pence,refunded_pence");
  if (from) totalsQuery = totalsQuery.gte("paid_at", `${from}T00:00:00.000Z`);
  if (to) totalsQuery = totalsQuery.lt("paid_at", `${to}T23:59:59.999Z`);
  const { data: totals } = await totalsQuery;
  const aggregate = (totals ?? []).reduce((result, item) => {
    result.gross += item.amount_pence;
    result.refunds += item.refunded_pence;
    result[item.campaign === "target" ? "target" : "generic"] += item.amount_pence - item.refunded_pence;
    return result;
  }, { gross: 0, refunds: 0, generic: 0, target: 0 });
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const exportParams = new URLSearchParams();
  if (campaign) exportParams.set("campaign", campaign);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>Donation ledger</h1><p>Verified Stripe payments and refunds. Refunds remain controlled in Stripe and are reconciled by webhook.</p></div><HeartHandshake/></header>
    <div className="stat-grid"><article><span>Gross</span><strong>{money.format(aggregate.gross / 100)}</strong></article><article><span>Refunds</span><strong>{money.format(aggregate.refunds / 100)}</strong></article><article><span>Net</span><strong>{money.format((aggregate.gross - aggregate.refunds) / 100)}</strong></article><article><span>Target campaign</span><strong>{money.format(aggregate.target / 100)}</strong></article></div>
    <form className="booking-search" method="get"><div className="form-grid three"><label>Campaign<select name="campaign" defaultValue={campaign || ""}><option value="">All campaigns</option><option value="generic">General</option><option value="target">Target</option></select></label><label>From<input type="date" name="from" defaultValue={from || ""}/></label><label>To<input type="date" name="to" defaultValue={to || ""}/></label></div><button className="button dark" type="submit">Apply filters</button> <Link className="button secondary" href={`/admin/donations/export?${exportParams}`}><Download/>Export CSV</Link> <Link className="button secondary" href="/settings"><Settings/>Configure campaigns</Link></form>
    <div className="member-table"><div className="member-row table-head"><span>Date / campaign</span><span>Gross / refunds</span><span>Net / status</span><span>Stripe references</span></div>{(payments ?? []).map((payment) => <div className="member-row" key={payment.id}><div><strong>{new Date(payment.paid_at).toLocaleDateString("en-GB")}</strong><small>{payment.campaign === "target" ? "Target campaign" : "General donation"}</small></div><div><span>{money.format(payment.amount_pence / 100)}</span><small>Refunded {money.format(payment.refunded_pence / 100)}</small></div><div><strong>{money.format((payment.amount_pence - payment.refunded_pence) / 100)}</strong><small>{payment.payment_status}</small></div><div><code>{payment.stripe_checkout_session_id}</code><small>{payment.stripe_payment_intent_id || "No PaymentIntent ID"}</small></div></div>)}</div>
    {!payments?.length ? <div className="empty-state"><h2>No donations in this period</h2><p>Verified payments will appear after Stripe delivers the webhook.</p></div> : null}
    {pages > 1 ? <nav className="pagination" aria-label="Donation pages">{page > 1 ? <Link href={pageLink(query, page - 1)}>Previous</Link> : <span/>}<span>Page {page} of {pages} · {count} records</span>{page < pages ? <Link href={pageLink(query, page + 1)}>Next</Link> : <span/>}</nav> : null}
  </div>;
}
