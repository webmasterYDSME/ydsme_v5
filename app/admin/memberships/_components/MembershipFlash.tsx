import { membershipErrorMessage, membershipNoticeMessage } from "@/lib/membership-admin/messages";

type Value = string | string[] | undefined;
const one = (value: Value) => (Array.isArray(value) ? value[0] : value);

/** The result of the last change, shown on whichever page a form action returns to. */
export function MembershipFlash({ query }: { query: { error?: Value; notice?: Value } }) {
  const error = one(query.error);
  const notice = one(query.notice);
  return <>
    {error ? <p className="form-message error" role="alert">{membershipErrorMessage(error) ?? <>That change could not be completed. Check the details and try again. <small>({error.replaceAll("-", " ")})</small></>}</p> : null}
    {notice ? <p className="form-message success" role="status">{membershipNoticeMessage(notice) ?? (notice === "membership-payment-settings-saved" ? "Payment details saved." : notice === "price-unchanged" ? "No fee change was needed. The current annual fee will continue automatically." : "Done. The membership record has been updated.")}</p> : null}
  </>;
}
