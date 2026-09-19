// Pure helpers for the Renewals screen: who still has to renew, and how the year is going.
// No imports, so they can be unit tested with `node --experimental-strip-types`.

export type RenewalRowStatus = "waiting" | "renewed" | "checking" | "blocked";

export type RenewalListMember = {
  id: string;
  full_name: string;
  contact_email: string | null;
  effective_state: string;
  plan_name: string | null;
};
export type RenewalListChoice = { member_id: string; membership_year: number; amount_pence: number | null; note: string };
export type RenewalListTerm = { member_id: string; membership_year: number; status: string; amount_due_pence: number; amount_paid_pence: number };

export type RenewalRow = {
  id: string;
  name: string;
  email: string | null;
  plan: string | null;
  state: string;
  status: RenewalRowStatus;
  invited: boolean;
  amountPence: number | null;
  note: string;
};

/** One row per member whose membership an officer can renew for the year, oldest-name first. */
export function buildRenewalRows(input: {
  year: number;
  members: RenewalListMember[];
  choices: RenewalListChoice[];
  terms: RenewalListTerm[];
  invitedIds: Iterable<string>;
}): RenewalRow[] {
  const invited = new Set(input.invitedIds);
  const rows: RenewalRow[] = [];
  for (const member of input.members) {
    const choice = input.choices.find((item) => item.member_id === member.id && item.membership_year === input.year);
    if (!choice) continue; // Not renewable by an officer: suspended, archived or honorary.
    const term = input.terms.find((item) => item.member_id === member.id && item.membership_year === input.year);
    let status: RenewalRowStatus = "waiting";
    if (term?.status === "paid" && term.amount_paid_pence >= term.amount_due_pence) status = "renewed";
    else if (term?.status === "payment_review") status = "checking";
    else if (choice.amount_pence === null) status = "blocked";
    rows.push({
      id: member.id,
      name: member.full_name,
      email: member.contact_email,
      plan: member.plan_name,
      state: member.effective_state,
      status,
      invited: invited.has(member.id),
      amountPence: choice.amount_pence,
      note: choice.note,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export type RenewalSummary = {
  invited: number;
  renewed: number;
  waiting: number;
  /** Waiting members with no email address: they have to be contacted another way. */
  waitingWithoutEmail: number;
  /** Waiting members a reminder email can reach. */
  remindable: number;
  /** Members who would get an invitation if renewals were opened (or reopened) now. */
  toInvite: number;
};

const INVITABLE_STATES = ["active", "grace", "lapsed"];

export function summariseRenewals(rows: RenewalRow[]): RenewalSummary {
  const invited = rows.filter((row) => row.invited);
  const waiting = invited.filter((row) => row.status !== "renewed");
  return {
    invited: invited.length,
    renewed: invited.length - waiting.length,
    waiting: waiting.length,
    waitingWithoutEmail: waiting.filter((row) => !row.email).length,
    remindable: waiting.filter((row) => row.email && row.status === "waiting" && INVITABLE_STATES.includes(row.state)).length,
    toInvite: rows.filter((row) => !row.invited && row.status === "waiting" && INVITABLE_STATES.includes(row.state)).length,
  };
}

export type RenewalShow = "waiting" | "renewed" | "all";

export function filterRenewalRows(rows: RenewalRow[], options: { show: RenewalShow; query: string }): RenewalRow[] {
  const q = options.query.trim().toLocaleLowerCase("en-GB");
  return rows.filter((row) => {
    if (options.show === "waiting" && row.status === "renewed") return false;
    if (options.show === "renewed" && row.status !== "renewed") return false;
    return !q || row.name.toLocaleLowerCase("en-GB").includes(q) || Boolean(row.email?.toLocaleLowerCase("en-GB").includes(q));
  });
}

/** Which year the Renewals screen opens on: an explicit valid choice, else next year, unless only this year's campaign is open. */
export function defaultRenewalYear(currentYear: number, openYears: number[], requested?: string | null): number {
  const asked = Number(requested);
  if (asked === currentYear || asked === currentYear + 1) return asked;
  if (openYears.includes(currentYear) && !openYears.includes(currentYear + 1)) return currentYear;
  return currentYear + 1;
}

/** "Not opened yet" / "Open · 120 invited · 45 renewed · 75 waiting" */
export function renewalStatusLine(input: { open: boolean; summary: RenewalSummary }): string {
  if (!input.open) return "Not opened yet";
  const { invited, renewed, waiting } = input.summary;
  return `Open · ${invited} invited · ${renewed} renewed · ${waiting} waiting`;
}

export type FeeRow = { plan_id: string; membership_year: number; amount_pence: number; version: number; active: boolean };

/** The annual fee in force for a membership type in a year: the latest active fee that starts in or before that year. */
export function feeInForce<T extends FeeRow>(prices: T[], planId: string, year: number): T | null {
  return prices
    .filter((price) => price.plan_id === planId && price.active && price.membership_year <= year)
    .sort((a, b) => b.membership_year - a.membership_year || b.version - a.version)[0] ?? null;
}
