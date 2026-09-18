// Pure display helpers shared by the membership administration screens.
// No imports, so they can be unit tested with `node --experimental-strip-types`.

export const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export const paymentMethodName = (method: string | null) => ({
  cash: "cash",
  bank_transfer: "bank transfer",
  cheque: "cheque",
  stripe: "online payment",
} as Record<string, string>)[method || ""] || "payment";

export const memberStateName = (state: string) => ({
  active: "Active",
  honorary: "Honorary",
  grace: "Payment overdue",
  payment_review: "Payment needs checking",
  lapsed: "Not currently active",
  suspended: "Suspended",
  archived: "Archived",
} as Record<string, string>)[state] || state.replaceAll("_", " ");

export const reviewKindName = (kind: string) => ({
  honorary_candidate: "Possible honorary member",
  shared_email: "Email address used by more than one person",
  missing_email: "No email address",
  portal_conflict: "Account link needs checking",
  unknown_plan: "Membership type needs checking",
} as Record<string, string>)[kind] || kind.replaceAll("_", " ");

/** "14 Jun 2026" for a plain YYYY-MM-DD date. */
export function dateLabel(value: string | null | undefined) {
  if (!value) return "";
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Today", "Yesterday" or "5 days" for a timestamp, measured in UTC days. */
export function waitingLabel(timestamp: string | null | undefined, now = new Date()) {
  if (!timestamp) return "";
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return "";
  const startOfDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days`;
}

/** Today's date in the Society's time zone as YYYY-MM-DD, evaluated on every call. */
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
