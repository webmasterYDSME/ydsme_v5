import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { Download, HeartHandshake, Settings } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type Query = { campaign?: string; from?: string; to?: string; page?: string };

function validDate(value?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const parsed = parseISO(value!);
  return Number.isNaN(parsed.getTime()) || format(parsed, "yyyy-MM-dd") !== value ? null : value!;
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
  const until = to ? `${format(addDays(parseISO(to), 1), "yyyy-MM-dd")}T00:00:00.000Z` : null;
  if (until) base = base.lt("paid_at", until);
  const [paymentResult, summaryResult] = await Promise.all([
    base.order("paid_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    admin.rpc("donation_management_summary", {
      p_from: from ? `${from}T00:00:00.000Z` : undefined,
      p_until: until ?? undefined,
    }),
  ]);
  const { data: payments, count, error } = paymentResult;
  if (error || summaryResult.error) throw new Error("Unable to load the donation ledger.");
  const rawAggregate = (summaryResult.data ?? {}) as Record<string, number>;
  const aggregate = {
    gross: Number(rawAggregate.gross ?? 0),
    refunds: Number(rawAggregate.refunds ?? 0),
    generic: Number(rawAggregate.generic ?? 0),
    target: Number(rawAggregate.target ?? 0),
    genericCount: Number(rawAggregate.generic_count ?? 0),
    targetCount: Number(rawAggregate.target_count ?? 0),
  };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const exportParams = new URLSearchParams();
  if (campaign) exportParams.set("campaign", campaign);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  const campaignHref = (value?: "generic" | "target") => `/admin/donations?${new URLSearchParams({ ...(value ? { campaign: value } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })}`;
  const hasDateFilters = Boolean(from || to);

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>Donations</h1><p>Reconcile verified Stripe payments and refunds across the Society’s active appeals.</p></div><span className="count-badge"><HeartHandshake/>{count ?? 0} matching</span></header>
    <div className="stat-grid"><article><span>Gross</span><strong>{money.format(aggregate.gross / 100)}</strong></article><article><span>Refunds</span><strong>{money.format(aggregate.refunds / 100)}</strong></article><article><span>Net</span><strong>{money.format((aggregate.gross - aggregate.refunds) / 100)}</strong></article><article><span>Target campaign</span><strong>{money.format(aggregate.target / 100)}</strong></article></div>
    <PortalTabs label="Donation campaign" tabs={[
      { href: campaignHref(), label: "All campaigns", count: aggregate.genericCount + aggregate.targetCount, current: campaign === null },
      { href: campaignHref("generic"), label: "General", count: aggregate.genericCount, current: campaign === "generic" },
      { href: campaignHref("target"), label: "Target", count: aggregate.targetCount, current: campaign === "target" },
    ]}/>
    <form className="portal-filter-panel" method="get"><input type="hidden" name="campaign" value={campaign || ""}/><div className="portal-filter-heading"><div><h2>Filter the ledger</h2><p>Choose a payment period, then export the same filtered view.</p></div><div className="portal-filter-actions"><Link prefetch={false} className="button secondary" href={`/admin/donations/export?${exportParams}`}><Download/>Export CSV</Link><Link prefetch={false} className="button secondary" href="/settings?tab=donations"><Settings/>Configure appeals</Link></div></div><div className="portal-filter-grid date-filter-grid"><label>From date<input type="date" name="from" defaultValue={from || ""}/></label><label>To date<input type="date" name="to" defaultValue={to || ""}/></label><button className="button dark" type="submit">Apply dates</button>{hasDateFilters ? <Link prefetch={false} className="portal-filter-clear" href={campaign ? `/admin/donations?campaign=${campaign}` : "/admin/donations"}>Clear dates</Link> : null}</div></form>
    <div className="member-table donation-table"><div className="member-row table-head"><span>Payment</span><span>Gross / refunds</span><span>Net / status</span><span>Stripe references</span></div>{(payments ?? []).map((payment) => <div className="member-row" key={payment.id}><div><strong>{new Date(payment.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong><small>{new Date(payment.paid_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small><span className={`campaign-chip is-${payment.campaign}`}>{payment.campaign === "target" ? "Target campaign" : "General donation"}</span></div><div><strong>{money.format(payment.amount_pence / 100)}</strong><small>Refunded {money.format(payment.refunded_pence / 100)}</small></div><div><strong>{money.format((payment.amount_pence - payment.refunded_pence) / 100)}</strong><span className={`payment-status is-${payment.payment_status}`}>{payment.payment_status.replaceAll("_", " ")}</span></div><div className="stripe-references"><code title={payment.stripe_checkout_session_id}>{payment.stripe_checkout_session_id}</code><small title={payment.stripe_payment_intent_id || undefined}>{payment.stripe_payment_intent_id || "No PaymentIntent ID"}</small></div></div>)}</div>
    {!payments?.length ? <div className="empty-state"><h2>No donations in this period</h2><p>Verified payments will appear after Stripe delivers the webhook.</p></div> : null}
    <PortalPagination currentPage={page} totalPages={pages} totalItems={count ?? 0} itemLabel="payments" href={(value) => pageLink({ campaign: campaign || undefined, from: from || undefined, to: to || undefined }, value)} ariaLabel="Donation pages"/>
  </div>;
}
