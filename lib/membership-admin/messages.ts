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
  "possible-duplicate": "Someone with the same email address, or the same name and date of birth, is already on the register. If this is a different person, say why in the highlighted box and try again.",
  "honorary-member-details-invalid": "Some details are missing or not valid. Check the name, email address, date of birth, start date and reason.",
  "honorary-member-create-failed": "The honorary member could not be added. Nothing was saved. Check the details and try again.",
  "honorary-already-exists": "This member already has an honorary membership, so nothing was changed.",
  "honorary-revoke-failed": "The change could not be scheduled. Check the date and the membership they move to, then try again.",
  "honorary-grant-failed": "The honorary membership could not be granted, so nobody was added. Check the start date and reason and try again.",
  "newsletter-email-required": "A newsletter subscription needs an email address. Add one, or untick the newsletter.",
  "newsletter-consent-evidence-required": "Say how the newsletter consent was given.",
  "newsletter-consent-date-invalid": "The date the newsletter consent was given cannot be in the future.",
  "phone-invalid": "Enter a phone number with 7–15 digits. Spaces, brackets, hyphens and a leading + are allowed.",
  "officer-member-create-failed": "The membership could not be added. Check the details and try again.",
};

/** The friendly message for an error code, or null when there is no specific wording for it. */
export const membershipErrorMessage = (code: string | null | undefined) => (code ? messages[code] ?? null : null);
