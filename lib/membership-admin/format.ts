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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** The one date format used across the membership screens: "2 Sept 2011", from a plain YYYY-MM-DD date (or the date part of a timestamp). */
export function dateLabel(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return "";
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** The same format for a timestamp, read as a day in the Society's time zone: "2 Sept 2011". */
export function timestampDateLabel(timestamp: string | null | undefined) {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return dateLabel(londonToday(date));
}

/** A timestamp with its time in the Society's time zone: "2 Sept 2011, 14:30". */
export function dateTimeLabel(timestamp: string | null | undefined) {
  const day = timestampDateLabel(timestamp);
  if (!day) return "";
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestamp as string));
  return `${day}, ${time}`;
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

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD day (a 29 February birthday counts from 1 March). Null when the date is missing. */
export function ageOn(dateOfBirth: string | null | undefined, day: string): number | null {
  const born = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth || "");
  const today = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  if (!born || !today) return null;
  const [by, bm, bd, ty, tm, td] = [born[1], born[2], born[3], today[1], today[2], today[3]].map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
