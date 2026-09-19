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
  "newsletter-no-membership": "Your account is not linked to a membership record yet, so there is no newsletter choice to change.",
};

export const genericNotice = "Your account and membership settings were updated.";
export const genericError = "The requested account change could not be completed.";
