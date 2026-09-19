// Helpers for the "Removing old member details" list. No imports, so they can be unit tested with
// `node --experimental-strip-types`.

export type RetentionRow = {
  member_id: string;
  full_name: string;
  contact_email: string | null;
  effective_state: string;
  basis: "last_paid_year" | "created";
  last_paid_year: number | null;
  retain_until: string;
  warned_at: string | null;
  blocked_reason: string | null;
  action: "anonymise" | "warn" | "waiting" | "upcoming" | "blocked";
};

export type RetentionGroups = {
  /** Would be anonymised on the next daily run. */
  ready: RetentionRow[];
  /** Would be sent their warning on the next daily run. */
  warn: RetentionRow[];
  /** Warned, waiting out the notice period. */
  waiting: RetentionRow[];
  /** Past or near their date but held back for a person to decide. */
  blocked: RetentionRow[];
  /** Not yet within a month of their date. */
  upcoming: RetentionRow[];
};

export function groupRetention(rows: RetentionRow[]): RetentionGroups {
  const pick = (action: RetentionRow["action"]) => rows.filter((row) => row.action === action);
  return {
    ready: pick("anonymise"),
    warn: pick("warn"),
    waiting: pick("waiting"),
    blocked: pick("blocked"),
    upcoming: pick("upcoming"),
  };
}

/** "31 December 2027" from a plain date like "2027-12-31". */
export function retentionDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const STATE_WORDS: Record<string, string> = {
  lapsed: "Lapsed", archived: "Archived", suspended: "Suspended", payment_review: "Payment being checked",
};

export function retentionDetail(row: RetentionRow) {
  const why = row.basis === "last_paid_year" ? `Last paid for ${row.last_paid_year}` : "Never paid";
  return `${STATE_WORDS[row.effective_state] ?? row.effective_state} · ${why} · details kept until ${retentionDateLabel(row.retain_until)}`;
}
