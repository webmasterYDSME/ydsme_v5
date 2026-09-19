// Plain-language messages for the errors an officer can meet on the membership screens.
// No imports, so they can be unit tested with `node --experimental-strip-types`.

const messages: Record<string, string> = {
  "officer-member-details-invalid": "Some details are missing or not valid. Check the name, date of birth and email address.",
  "offline-payment-evidence-required": "To record the payment as received, add a receipt or payment reference.",
  "cheque-clearance-required": "Tick “Cheque cleared” to record a cheque as paid in full, or untick “Payment received in full”.",
  "future-payment-date": "The membership start date cannot be in the future.",
  "price-unavailable": "No fee has been set for that membership year. Set the annual fee under Setup first.",
  "plan-age-mismatch": "No membership type fits that date of birth on the chosen start date. Check the date of birth.",
  "guardian-consent-required": "A junior member needs a guardian’s name and a note of how the guardian’s consent was given.",
  "possible-duplicate": "Someone with the same email address, or the same name and date of birth, is already on the register. If this is a different person, explain why under “Already on the register?” and add them again.",
  "officer-member-create-failed": "The membership could not be added. Check the details and try again.",
};

/** The friendly message for an error code, or null when there is no specific wording for it. */
export const membershipErrorMessage = (code: string | null | undefined) => (code ? messages[code] ?? null : null);
