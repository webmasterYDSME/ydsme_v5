/**
 * A member can pay by card and the website still be unable to update their membership
 * (the fee changed while they were paying, the year was already paid another way, and so on).
 * The database explains why with a `membership_…` code. These helpers turn that into a
 * record an officer can act on, in plain words.
 */

export const UNAPPLIED_PREFIX = "unapplied:";

/** Codes that a retry might fix, so Stripe should keep resending the event. */
const RETRYABLE_CODES = new Set(["membership_checkout_payment_time_invalid"]);

/** Returns the database's `membership_…` code if the error is a business refusal, otherwise null (network, timeout and similar). */
export function membershipRefusalCode(message: string | null | undefined): string | null {
  const match = /\bmembership_[a-z_]+\b/.exec(message ?? "");
  if (!match || RETRYABLE_CODES.has(match[0])) return null;
  return match[0];
}

const REASONS: Record<string, string> = {
  membership_application_not_payable: "The application was no longer waiting for a card payment. It may have been closed, or switched to cash or bank transfer.",
  membership_payment_amount_invalid: "The membership fee changed while they were paying, so the amount no longer matches.",
  membership_renewal_amount_invalid: "The membership fee changed while they were paying, so the amount no longer matches.",
  membership_renewal_already_paid: "This year’s membership was already paid another way.",
  membership_renewal_member_unavailable: "The membership record is suspended or archived.",
  membership_renewal_price_unavailable: "The membership type or its price is no longer available.",
  membership_price_unavailable: "The membership type or its price is no longer available.",
  membership_plan_unavailable: "The membership type is no longer available.",
  membership_renewal_year_invalid: "The membership year on the payment is no longer valid.",
  membership_checkout_quote_mismatch: "The payment does not match the quote the website issued.",
  membership_application_not_found: "The application could not be found.",
  membership_possible_duplicate: "A member with the same name and date of birth already exists.",
  membership_guardian_not_verified: "The guardian has not confirmed consent yet.",
};

const FALLBACK = "Membership could not be updated automatically.";

export function unappliedPaymentReason(lastError: string | null | undefined): string {
  const code = (lastError ?? "").slice(UNAPPLIED_PREFIX.length);
  return REASONS[code] ?? FALLBACK;
}

export function isUnappliedPayment(lastError: string | null | undefined): boolean {
  return Boolean(lastError?.startsWith(UNAPPLIED_PREFIX));
}

/** A second successful card payment for someone whose membership was already active. */
export const DUPLICATE_PAYMENT_REASON = "They had already paid, and a second card payment came through as well.";
