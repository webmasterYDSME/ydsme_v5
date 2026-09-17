import Link from "next/link";
import { ArrowLeft, CalendarCheck, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { continueApplicationCheckout } from "@/lib/actions/membership";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { getApplicationCheckoutSummaryFromToken } from "@/lib/membership";
import styles from "./checkout.module.css";

export const dynamic = "force-dynamic";

const money = (pence: number) => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP",
}).format(pence / 100);

export default async function MembershipCheckoutConfirmation({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = (await searchParams).token ?? "";
  const summary = await getApplicationCheckoutSummaryFromToken(token);
  if (!summary) redirect("/membership/apply?application=payment-link-invalid");
  return <PageShell headerTheme="light">
    <div className={`membership-checkout-page ${styles.checkout}`}>
      <div className="membership-checkout-wrap">
        <Link className="membership-checkout-back" href="/membership"><ArrowLeft/>Membership overview</Link>

        <form action={continueApplicationCheckout} className="membership-checkout-card">
          <input type="hidden" name="token" value={token}/>

          <section className="membership-checkout-main" aria-labelledby="checkout-confirmation-title">
            <div className="membership-checkout-heading">
              <span className="membership-checkout-icon" aria-hidden="true"><CreditCard/></span>
              <div>
                <p className="eyebrow dark">Membership payment</p>
                <h1 id="checkout-confirmation-title">Review your payment.</h1>
              </div>
            </div>
            <p className="membership-checkout-intro">Check the membership and payment details below before continuing.</p>

            <div className="membership-checkout-member">
              <span className="membership-checkout-member-icon" aria-hidden="true"><UserRound/></span>
              <span><small>Membership for</small><strong>{summary.fullName}</strong></span>
              <span className="membership-checkout-plan">{summary.planName}</span>
            </div>

            <div className="membership-checkout-renewal">
              <p className="eyebrow dark">Your renewal choice</p>
              <label htmlFor="membership-auto-renew">
                <input id="membership-auto-renew" type="checkbox" name="auto_renew" defaultChecked={summary.autoRenew}/>
                <strong>Automatically renew each 1 January</strong>
                <small>Keep your membership up to date without arranging another payment.</small>
              </label>
              <p>You can cancel at any time from your Account. Switching this off does not change the payment due today.</p>
            </div>
          </section>

          <aside className="membership-checkout-summary" aria-label="Payment summary">
            <p className="eyebrow">Due today</p>
            <strong className="membership-checkout-price">{money(summary.initialAmountPence)}</strong>
            <p className="membership-checkout-cover"><CalendarCheck/>Membership through 31 December {summary.membershipYear}</p>

            <dl>
              <div>
                <dt>Annual renewal</dt>
                <dd>{money(summary.annualAmountPence)}</dd>
              </div>
              <div>
                <dt>Renewal date</dt>
                <dd>1 January {summary.membershipYear + 1}</dd>
              </div>
            </dl>
            <p className="membership-checkout-renewal-note">This next payment is taken only while automatic renewal remains on.</p>

            <PendingSubmitButton className="button membership-checkout-submit" pendingLabel="Opening secure payment…"><ShieldCheck/>Continue to payment</PendingSubmitButton>
            <p className="membership-checkout-security"><ShieldCheck/>Your membership starts after the payment has been confirmed.</p>
          </aside>
        </form>
      </div>
    </div>
  </PageShell>;
}
