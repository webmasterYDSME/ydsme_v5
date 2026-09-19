type Value = string | string[] | undefined;
const one = (value: Value) => (Array.isArray(value) ? value[0] : value);

const friendlyErrors: Record<string, string> = {
  "possible-duplicate": "Someone with the same email address, or the same name and date of birth, is already on the register. If this is a different person, open Add membership again and explain why under “Already on the register?”.",
  "guardian-consent-required": "A junior member needs a guardian’s name and a note of how the guardian’s consent was given.",
  "plan-age-mismatch": "No membership type fits that date of birth on the chosen start date. Check the date of birth.",
};

/** The result of the last change, shown on whichever page a form action returns to. */
export function MembershipFlash({ query }: { query: { error?: Value; notice?: Value } }) {
  const error = one(query.error);
  const notice = one(query.notice);
  return <>
    {error ? <p className="form-message error" role="alert">{friendlyErrors[error] ?? <>That change could not be completed. Check the details and try again. <small>({error.replaceAll("-", " ")})</small></>}</p> : null}
    {notice ? <p className="form-message success" role="status">{notice === "membership-payment-settings-saved" ? "Membership payment instructions saved as a new version." : notice === "price-unchanged" ? "No fee change was needed. The current annual fee will continue automatically." : "Done. The membership record has been updated."}</p> : null}
  </>;
}
