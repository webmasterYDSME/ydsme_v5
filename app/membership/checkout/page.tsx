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

export default async function MembershipCheckoutConfirmation({ searchParams }: { searchParams: Promise<{ token?: string; notice?: string }> }) {
  if (!(await membershipBillingEnabled())) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const query = await searchParams;
  const token = query.token ?? "";
  const summary = await getApplicationCheckoutSummaryFromToken(token);
  if (!summary) redirect("/membership/apply?application=payment-link-invalid");
  return <PageShell headerTheme="light">
    <div className={`membership-checkout-page ${styles.checkout}`}>
      <div className="membership-checkout-wrap">
        <Link className="membership-checkout-back" href="/membership"><ArrowLeft/>Membership overview</Link>

        <form action={continueApplicationCheckout} className="membership-checkout-card">
          <input type="hidden" name="token" value={token}/>
          <input type="hidden" name="reviewed_quote" value={summary.quoteKey}/>

          <section className="membership-checkout-main" aria-labelledby="checkout-confirmation-title">
            <div className="membership-checkout-heading">
              <span className="membership-checkout-icon" aria-hidden="true"><CreditCard/></span>
              <div>
                <p className="eyebrow dark">Membership payment</p>
                <h1 id="checkout-confirmation-title">Review your payment.</h1>
              </div>
            </div>
            {query.notice === "review-updated-price" && <p role="status">Please review the current price and membership end date below before continuing. Your application and email verification are saved.</p>}
            {summary.checkoutPaused && <p role="status">New payment pages reopen at midnight tonight, 1 December (UK time). Return then to review the following year’s annual fee, with the remaining December days included free. Your application and email verification are saved.</p>}
            <p className="membership-checkout-intro">Check the membership and payment details below before continuing.</p>

            <div className="membership-checkout-member">
              <span className="membership-checkout-member-icon" aria-hidden="true"><UserRound/></span>
              <span><small>Membership for</small><strong>{summary.fullName}</strong></span>
              <span className="membership-checkout-plan">{summary.planName}</span>
            </div>

            <p>This is a one-time payment. We will invite you when annual renewals open.</p>
          </section>

          <aside className="membership-checkout-summary" aria-label="Payment summary">
            <p className="eyebrow">{summary.checkoutPaused ? "November quote · payment paused" : "Due today"}</p>
            <strong className="membership-checkout-price">{money(summary.initialAmountPence)}</strong>
            <p className="membership-checkout-cover"><CalendarCheck/>Membership through 31 December {summary.membershipYear}</p>

            <PendingSubmitButton disabled={summary.checkoutPaused} className="button membership-checkout-submit" pendingLabel="Opening secure payment…"><ShieldCheck/>Continue to payment</PendingSubmitButton>
            <p className="membership-checkout-security"><ShieldCheck/>Your membership starts after the payment has been confirmed.</p>
          </aside>
        </form>
      </div>
    </div>
  </PageShell>;
}
