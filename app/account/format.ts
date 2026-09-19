/** Plain-language labels and formats shared by the account page sections. */

export const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

/** A calendar date such as "1 March 2024" from a yyyy-mm-dd string. */
export const date = (value: string) => new Date(`${value}T12:00:00Z`)
  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export const paymentMethod = (method: string) => method === "stripe" ? "online" : method.replaceAll("_", " ");

export const membershipStatus = (status: string) => ({
  active: "Active",
  honorary: "Lifetime honorary",
  grace: "Renewal due",
  payment_review: "Payment being checked",
  lapsed: "Lapsed",
  suspended: "Access suspended",
  archived: "Account archived",
  scheduled: "Upcoming",
  paid: "Paid",
  void: "Cancelled",
  revoked: "Ended",
}[status] || status.replaceAll("_", " "));

export const paymentStatus = (status: string) => ({
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  disputed: "Payment being checked",
  void: "Cancelled",
}[status] || status.replaceAll("_", " "));

export type StatusTone = "good" | "warn" | "bad";

/** How a membership state is coloured: fine, needs attention, or not in force. */
export function statusTone(status: string): StatusTone {
  if (status === "active" || status === "honorary") return "good";
  if (status === "grace" || status === "payment_review") return "warn";
  return "bad";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Messages shown after something on the page was changed. Unknown keys get the generic one. */
export const accountNotices: Record<string, string> = {
  "profile-updated": "Your profile was saved.",
  "email-confirmation-sent": "We sent a confirmation link to your new login email. It changes once you open it.",
  "contact-verification-sent": "We sent a verification link to the new membership email address. It changes once you open it.",
  "renewal-updated": "Your renewal setting was updated.",
  "student-request-sent": "Your Student membership request was sent to the membership officer.",
  "newsletter-subscribed": "You are subscribed to the Society newsletter.",
  "newsletter-unsubscribed": "You are unsubscribed from the Society newsletter.",
  "address-updated": "Your address and date of birth were saved.",
};

export const accountErrors: Record<string, string> = {
  "renewal-unavailable": "Online renewal is not currently available. Your existing membership and recorded payments are unchanged.",
  "payment-cancelled": "The payment was cancelled. No payment was recorded.",
  "membership-unavailable": "Online membership services are temporarily unavailable.",
  "no-subscription": "There is no automatic renewal to change.",
  "offline-renewal-locked": "An offline payment already covers your next term, so automatic renewal cannot be changed.",
  "renewal-update-failed": "Your renewal setting could not be changed. Nothing was changed.",
  "renewal-update-pending": "Your renewal setting is still being updated. Please check again shortly.",
  "student-request-unavailable": "A Student membership request cannot be made right now.",
  "contact-change-failed": "The membership email could not be changed. Please check the address and try again.",
  "contact-change-rate-limited": "This has been tried several times. Please wait a little before trying again.",
  "newsletter-failed": "We could not change your newsletter choice. Nothing was changed.",
  "newsletter-rate-limited": "You have changed this several times. Please wait a little before trying again.",
  "newsletter-address-blocked": "Emails to your membership address could not be delivered, so we cannot add it to the newsletter. Please contact the membership officer.",
  "newsletter-email-required": "Add a membership email address before subscribing to the newsletter.",
  "address-invalid": "Please check the address. One of the lines is too long.",
  "address-birth-date-invalid": "Enter a real date of birth that is not in the future.",
  "address-birth-date-locked": "Your date of birth is already recorded. Please contact the membership officer to change it.",
  "address-rate-limited": "You have saved this several times. Please wait a little before trying again.",
  "address-failed": "We could not save your details. Nothing was changed.",
  "address-no-membership": "Your account is not linked to a membership record yet, so there is nothing to change.",
  "newsletter-no-membership": "Your account is not linked to a membership record yet, so there is no newsletter choice to change.",
};

export const genericNotice = "Your account and membership settings were updated.";
export const genericError = "The requested account change could not be completed.";

/** A message meant for one section, picked out of the page address by the section's prefix (for example "newsletter-"). */
export function sectionMessage(query: { error?: string; notice?: string }, prefix: string): { tone: "success" | "error"; text: string } | null {
  if (query.error?.startsWith(prefix)) return { tone: "error", text: accountErrors[query.error] || genericError };
  if (query.notice?.startsWith(prefix)) return { tone: "success", text: accountNotices[query.notice] || genericNotice };
  return null;
}

/** "3 hours ago", or the date once it is more than a month old. */
export function relativeTime(value: string, now = new Date()) {
  const then = new Date(value);
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800]];
  const age = Math.abs(seconds);
  if (age < 60) return "just now";
  if (age >= 30 * 86400) return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  let unit = steps[0];
  for (const step of steps) if (age >= step[1]) unit = step;
  return formatter.format(Math.trunc(seconds / unit[1]), unit[0]);
}

/** A link inside this website only: never another site, and never a protocol-relative address. */
export function safeInternalHref(href: string | null) {
  return href && href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? href : null;
}

/** London's calendar date today as yyyy-mm-dd. */
export const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** The three tabs of the account page. Which ones exist depends on whether the website runs membership. */
export type AccountTab = "membership" | "details" | "settings";

export const accountTabLabels: Record<AccountTab, string> = { membership: "Membership", details: "Your details", settings: "Settings" };

/**
 * The tab to show. An explicit ?tab= wins; otherwise a result message decides, so that after saving something the person
 * lands back where they were (other pages redirect here with only a notice or error); otherwise the first tab.
 */
export function pickAccountTab(query: { tab?: string; error?: string; notice?: string }, membershipEnabled: boolean): AccountTab {
  const available: AccountTab[] = membershipEnabled ? ["membership", "details", "settings"] : ["details", "settings"];
  const asked = available.find((tab) => tab === query.tab);
  if (asked) return asked;
  const key = query.error ?? query.notice ?? "";
  const inferred: AccountTab | null = /^(address-|profile-)|profile/i.test(key) ? "details"
    : /^(newsletter-|contact-|email-confirmation)|login email|valid email/i.test(key) ? "settings"
      : null;
  return inferred && available.includes(inferred) ? inferred : available[0];
}
