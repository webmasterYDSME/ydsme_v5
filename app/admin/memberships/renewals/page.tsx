import Link from "next/link";
import { UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { membershipBillingEnabled } from "@/lib/features";
import { money } from "@/lib/membership-admin/format";
import { loadPlansAndPrices, loadRenewalWorkspace } from "@/lib/membership-admin/records";
import { feeInForce, filterRenewalRows, type RenewalRowStatus, type RenewalShow } from "@/lib/membership-admin/renewals";
import { PortalPagination } from "@/app/components/PortalPagination";
import { MemberPaymentPanel } from "../_components/MemberPaymentPanel";
import { MembershipFlash } from "../_components/MembershipFlash";
import { RenewalFees } from "../_components/RenewalFees";
import { FeeChangePanel, PlanDetailsPanel } from "../_components/RenewalPanels";
import { RenewalsOverview } from "../_components/RenewalsOverview";
import styles from "../memberships.module.css";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const PAGE_SIZE = 25;
const BASE = "/admin/memberships/renewals";

const statusLabel: Record<RenewalRowStatus, string> = { waiting: "Waiting", renewed: "Renewed", checking: "Checking", blocked: "Not due" };
const statusClass = (status: RenewalRowStatus) => status === "renewed" ? styles.pillOk : status === "checking" ? styles.pillPayment : styles.pillMute;

export default async function MembershipRenewals({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  await requireCapability("memberships.manage");
  const [work, { plans, prices }] = await Promise.all([loadRenewalWorkspace(one(query.year)), loadPlansAndPrices()]);
  const { currentYear, year, rows, summary } = work;
  const years = [currentYear, currentYear + 1];

  const q = (one(query.q) || "").trim();
  const requestedShow = one(query.show);
  const show: RenewalShow = requestedShow === "renewed" || requestedShow === "all" ? requestedShow : "waiting";
  const counts = {
    waiting: rows.filter((row) => row.status !== "renewed").length,
    renewed: rows.filter((row) => row.status === "renewed").length,
    all: rows.length,
  };
  const filtered = filterRenewalRows(rows, { show, query: q });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(query.page) || "1", 10) || 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Every link keeps the chosen year, list filter and search, so opening and closing a panel changes nothing else.
  const href = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams({ year: String(year) });
    if (show !== "waiting") params.set("show", show);
    if (q) params.set("q", q);
    for (const [key, value] of Object.entries(overrides)) { if (value) params.set(key, value); else params.delete(key); }
    return `${BASE}?${params}`;
  };
  const closeHref = href({ panel: "", member: "", plan: "", page: "" });

  const missingFees = plans.filter((plan) => plan.active && !feeInForce(prices, plan.id, year)).map((plan) => plan.name as string);
  const panel = one(query.panel);
  const panelPlan = plans.find((plan) => plan.id === one(query.plan)) ?? null;
  const panelRow = rows.find((row) => row.id === one(query.member)) ?? null;

  return <>
    <MembershipFlash query={query}/>
    <p className={styles.tabNote}>Open the yearly renewals, remind members who have not paid, record cash, bank and cheque payments, and keep the annual fees.</p>
    <div className={styles.stack}>
      <RenewalsOverview
        year={year} years={years} yearHref={(option) => `${BASE}?year=${option}`}
        open={work.campaignOpen} summary={summary} lastReminderAt={work.lastReminderAt}
        missingFees={missingFees} billingOn={membershipBillingEnabled()}
      />

      <section className={styles.card} id="renewals">
        <h2>Who has renewed</h2>
        <form className={`${styles.search} ${styles.cardGap}`} method="get" action={BASE}>
          <input type="hidden" name="year" value={year}/>
          {show !== "waiting" ? <input type="hidden" name="show" value={show}/> : null}
          <label>Find a member<input name="q" defaultValue={q} placeholder="Name or correspondence email"/></label>
          <button className="button dark">Search</button>
          {q ? <Link className={styles.linkButton} href={href({ q: "", page: "" })}>Clear</Link> : null}
        </form>
        <nav className={styles.chips} aria-label="Filter the list" style={{ marginBottom: 14 }}>
          {([["waiting", "Waiting", counts.waiting], ["renewed", "Renewed", counts.renewed], ["all", "Everyone", counts.all]] as const).map(([key, label, count]) =>
            <Link key={key} className={`${styles.chip} ${key === show ? styles.chipOn : ""}`} href={href({ show: key === "waiting" ? "" : key, page: "" })} prefetch={false} aria-current={key === show ? "true" : undefined}>{label}<span>{count}</span></Link>)}
        </nav>
        {filtered.length ? <>
          <div className={styles.register}>
            <div className={`${styles.registerRow} ${styles.registerHead}`} aria-hidden="true"><span>Member</span><span>Membership</span><span>Status</span><span>{year} fee</span><span/></div>
            {visible.map((row) => <article className={styles.registerRow} key={row.id}>
              <div>
                <strong><Link className={styles.nameLink} href={`/admin/memberships/members/${row.id}`} prefetch={false}>{row.name}</Link></strong>
                <small>{row.email || "No correspondence email"}</small>
                {row.status === "blocked" || row.status === "checking" ? <small>{row.note}</small> : null}
              </div>
              <div className={styles.registerMeta}>
                <span>{row.plan || "—"}</span>
                <span><span className={`${styles.pill} ${statusClass(row.status)}`}>{statusLabel[row.status]}</span></span>
                <span>{row.amountPence === null ? "—" : money(row.amountPence)}</span>
              </div>
              {row.status === "waiting"
                ? <Link className={styles.rowAction} href={href({ panel: "payment", member: row.id })} prefetch={false} scroll={false}>Record payment</Link>
                : <span/>}
            </article>)}
          </div>
          <PortalPagination currentPage={page} totalPages={pages} totalItems={filtered.length} itemLabel="members" href={(next) => href({ page: String(next) })} ariaLabel="Renewals list pages"/>
        </> : <div className="membership-empty-state"><UsersRound/><strong>{q ? "No members found" : show === "waiting" ? "Nobody is waiting" : "Nothing to show"}</strong><p>{q ? "Try another name or email address." : show === "waiting" ? `Everyone who can renew for ${year} has renewed.` : "Try another filter."}</p></div>}
      </section>

      <RenewalFees
        plans={plans} prices={prices} years={years}
        feeHref={(planId) => href({ panel: "fee", plan: planId })}
        typeHref={(planId) => href({ panel: "type", plan: planId })}
      />
    </div>

    {panel === "payment" && panelRow
      ? <MemberPaymentPanel
        memberId={panelRow.id} name={panelRow.name} planName={panelRow.plan} renewable
        choices={work.choices.filter((choice) => choice.member_id === panelRow.id)} currentYear={currentYear} year={year}
        closeHref={closeHref} yearHref={(option) => href({ panel: "payment", member: panelRow.id, year: String(option) })} returnTo="renewals"
      /> : null}
    {panel === "fee" && panelPlan
      ? <FeeChangePanel plan={panelPlan} prices={prices} years={years} defaultYear={year} affected={work.affectedByPlan[panelPlan.id] ?? 0} closeHref={closeHref}/> : null}
    {panel === "type" && panelPlan ? <PlanDetailsPanel plan={panelPlan} closeHref={closeHref}/> : null}
  </>;
}
