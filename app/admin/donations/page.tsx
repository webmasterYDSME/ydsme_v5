import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { Download, HeartHandshake, Settings } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveDonationSettings } from "@/lib/actions/content";
import { defaultDonationSettings } from "@/lib/donations";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type Query = { campaign?: string; from?: string; to?: string; page?: string; view?: string; error?: string; notice?: string };

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
  const query = await searchParams;
  const view = query.view === "appeals" ? "appeals" : "payments";
  await requireCapability("donations.view");
  if (view === "appeals") await requireCapability("donations.manage");
  const admin = createAdminClient();

  if (view === "appeals") {
    const [configResult, campaignResult] = await Promise.all([
      admin.from("configs").select("id").limit(1).single(),
      admin.from("donation_campaigns").select("kind,enabled,title,description,button_label,target_pence"),
    ]);
    if (configResult.error || campaignResult.error || !configResult.data) throw new Error("Unable to load donation appeals.");
    const campaignData = campaignResult.data ?? [];
    const generic = campaignData.find((item) => item.kind === "generic");
    const target = campaignData.find((item) => item.kind === "target");
    const donations = {
      generic: generic ? { enabled: generic.enabled, title: generic.title, description: generic.description, buttonLabel: generic.button_label } : defaultDonationSettings.generic,
      target: target ? { enabled: target.enabled, title: target.title, description: target.description, buttonLabel: target.button_label, targetPence: Number(target.target_pence), raisedPence: 0 } : defaultDonationSettings.target,
    };
    const errorMessage = query.error === "payment-configuration"
      ? "Online donations cannot be enabled until the online payment settings are complete."
      : query.error === "load"
        ? "Donation appeals could not be loaded. Please try again."
        : query.error === "save"
          ? "Donation appeals could not be saved. Please try again."
          : "Please check the appeal details and try again.";

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Membership and fundraising</p><h1>Donations</h1><p>Review donations and control the fundraising appeals shown to visitors.</p></div><span className="count-badge"><HeartHandshake/>Fundraising</span></header>
      {query.error ? <p className="form-message error">{errorMessage}</p> : null}
      {query.notice === "donations-saved" ? <p className="form-message success">Donation appeals saved.</p> : null}
      <PortalTabs label="Donation management" tabs={[
        { href: "/admin/donations", label: "Payments", current: false },
        { href: "/admin/donations?view=appeals", label: "Appeals", current: true },
      ]}/>
      <section className="settings-tab-panel donation-manager">
        <header className="settings-panel-heading"><div><span>Public fundraising</span><h2>Donation appeals</h2><p>Control which appeals visitors see and the message used for each one.</p></div><HeartHandshake/></header>
        <form action={saveDonationSettings} className="editor-form">
          <input type="hidden" name="id" value={configResult.data.id}/>
          <p className="wide form-help donation-manager-help">Each component stays hidden until it is enabled. Visitors choose an amount before continuing to the secure payment page.</p>
          <fieldset className="wide donation-settings-card">
            <legend>General donation</legend>
            <label className="check donation-toggle"><input type="checkbox" name="generic_enabled" defaultChecked={donations.generic.enabled}/>Show the general donation section near the end of the visitors page</label>
            <div className="donation-settings-grid">
              <label>Heading<input name="generic_title" defaultValue={donations.generic.title} required/></label>
              <label>Button label<input name="generic_button_label" defaultValue={donations.generic.buttonLabel} required/></label>
              <label className="wide">Description<textarea name="generic_description" rows={4} defaultValue={donations.generic.description} required/></label>
            </div>
          </fieldset>
          <fieldset className="wide donation-settings-card target-settings-card">
            <legend>Target campaign</legend>
            <label className="check donation-toggle"><input type="checkbox" name="target_enabled" defaultChecked={donations.target.enabled}/>Show the target campaign after the main railway image on the homepage</label>
            <div className="donation-settings-grid">
              <label>Heading<input name="target_title" defaultValue={donations.target.title} required/></label>
              <label>Button label<input name="target_button_label" defaultValue={donations.target.buttonLabel} required/></label>
              <label className="wide">Description<textarea name="target_description" rows={4} defaultValue={donations.target.description} required/></label>
              <label>Campaign target (£)<input type="number" name="target_pounds" min="1" max="10000000" step="0.01" defaultValue={donations.target.targetPence / 100} required/></label>
              <p className="donation-total-note">Raised funds update automatically from confirmed online donations and refunds.</p>
            </div>
          </fieldset>
          <PendingSubmitButton className="button dark">Save donation appeals</PendingSubmitButton>
        </form>
      </section>
    </div>;
  }

  const campaign = ["generic", "target"].includes(query.campaign || "") ? query.campaign! : null;
  const from = validDate(query.from);
  const to = validDate(query.to);
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
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

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Membership and fundraising</p><h1>Donations</h1><p>Check online payments and refunds across the Society’s active appeals.</p></div><span className="count-badge"><HeartHandshake/>{count ?? 0} matching</span></header>
    <PortalTabs label="Donation management" tabs={[
      { href: "/admin/donations", label: "Payments", count: aggregate.genericCount + aggregate.targetCount, current: true },
      { href: "/admin/donations?view=appeals", label: "Appeals", current: false },
    ]}/>
    <div className="stat-grid"><article><span>Gross</span><strong>{money.format(aggregate.gross / 100)}</strong></article><article><span>Refunds</span><strong>{money.format(aggregate.refunds / 100)}</strong></article><article><span>Net</span><strong>{money.format((aggregate.gross - aggregate.refunds) / 100)}</strong></article><article><span>Target campaign</span><strong>{money.format(aggregate.target / 100)}</strong></article></div>
    <PortalTabs label="Donation campaign" tabs={[
      { href: campaignHref(), label: "All campaigns", count: aggregate.genericCount + aggregate.targetCount, current: campaign === null },
      { href: campaignHref("generic"), label: "General", count: aggregate.genericCount, current: campaign === "generic" },
      { href: campaignHref("target"), label: "Target", count: aggregate.targetCount, current: campaign === "target" },
    ]}/>
    <form className="portal-filter-panel" method="get"><input type="hidden" name="campaign" value={campaign || ""}/><div className="portal-filter-heading"><div><h2>Filter payment records</h2><p>Choose a payment period, then download the same filtered records.</p></div><div className="portal-filter-actions"><Link prefetch={false} className="button secondary" href={`/admin/donations/export?${exportParams}`}><Download/>Download spreadsheet</Link><Link prefetch={false} className="button secondary" href="/admin/donations?view=appeals"><Settings/>Manage appeals</Link></div></div><div className="portal-filter-grid date-filter-grid"><label>From date<input type="date" name="from" defaultValue={from || ""}/></label><label>To date<input type="date" name="to" defaultValue={to || ""}/></label><button className="button dark" type="submit">Apply dates</button>{hasDateFilters ? <Link prefetch={false} className="portal-filter-clear" href={campaign ? `/admin/donations?campaign=${campaign}` : "/admin/donations"}>Clear dates</Link> : null}</div></form>
    <div className="member-table donation-table"><div className="member-row table-head"><span>Payment</span><span>Gross / refunds</span><span>Net / status</span><span>Payment references</span></div>{(payments ?? []).map((payment) => <div className="member-row" key={payment.id}><div><strong>{new Date(payment.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong><small>{new Date(payment.paid_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small><span className={`campaign-chip is-${payment.campaign}`}>{payment.campaign === "target" ? "Target campaign" : "General donation"}</span></div><div><strong>{money.format(payment.amount_pence / 100)}</strong><small>Refunded {money.format(payment.refunded_pence / 100)}</small></div><div><strong>{money.format((payment.amount_pence - payment.refunded_pence) / 100)}</strong><span className={`payment-status is-${payment.payment_status}`}>{payment.payment_status.replaceAll("_", " ")}</span></div><div className="stripe-references"><code title={payment.stripe_checkout_session_id}>{payment.stripe_checkout_session_id}</code><small title={payment.stripe_payment_intent_id || undefined}>{payment.stripe_payment_intent_id || "No payment reference"}</small></div></div>)}</div>
    {!payments?.length ? <div className="empty-state"><h2>No donations in this period</h2><p>Verified payments will appear after the payment is confirmed.</p></div> : null}
    <PortalPagination currentPage={page} totalPages={pages} totalItems={count ?? 0} itemLabel="payments" href={(value) => pageLink({ campaign: campaign || undefined, from: from || undefined, to: to || undefined }, value)} ariaLabel="Donation pages"/>
  </div>;
}
