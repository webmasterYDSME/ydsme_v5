import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  MailCheck,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PageShell } from "@/app/components/PageShell";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { MembershipApplicationWizard } from "@/app/membership/apply/MembershipApplicationWizard";
import { resendMembershipVerification } from "@/lib/actions/membership";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { getPublicMembershipPlans, proratedMembershipFee } from "@/lib/membership";
import { getMembershipPaymentSettings } from "@/lib/membership-settings";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Apply for Membership",
  description: "Apply to join York Model Engineers and choose online payment, cash, bank transfer or cheque.",
  path: "/membership/apply",
  keywords: ["York Model Engineers application", "join York Model Engineers"],
});

const applicationErrors: Record<string, string> = {
  eligibility: "The selected plan does not match the eligibility details supplied.",
  invalid: "Check the application details and try again.",
  "security-check": "The security check was not completed. Please try again.",
  "payment-method-unavailable": "That payment method is temporarily unavailable. Choose another option or contact the Society Treasurer.",
  "status-link-invalid": "This application status link is invalid or has expired. Request a fresh verification link or contact the membership officer.",
  unavailable: "Online membership applications are not currently open.",
};

type ApplicationOutcome = {
  eyebrow: string;
  title: string;
  message: string;
  tone: "success" | "waiting" | "attention";
  icon: "mail" | "calendar" | "shield";
  primaryLabel?: string;
  primaryHref?: string;
  allowResend?: boolean;
};

const applicationOutcomes: Record<string, ApplicationOutcome> = {
  received: {
    eyebrow: "Application received",
    title: "Check your inbox.",
    message: "A membership email should arrive within one minute. Open the secure link to continue, and check your junk folder if it does not appear. For privacy, this is the same response for new and existing records.",
    tone: "success", icon: "mail", allowResend: true,
  },
  "verification-resent": {
    eyebrow: "Email requested",
    title: "A fresh link is on its way.",
    message: "If an application is waiting for email or guardian verification, a new secure link should arrive within one minute. Check the junk folder if it does not appear. This response does not disclose whether a record exists.",
    tone: "success", icon: "mail",
  },
  "awaiting-approval": {
    eyebrow: "Application verified",
    title: "Your application is ready for review.",
    message: "A membership officer will check the application and contact you when it is time to continue.",
    tone: "waiting", icon: "calendar",
  },
  "awaiting-cash": {
    eyebrow: "Application verified",
    title: "Payment can now be arranged.",
    message: "A membership officer will activate the membership after the complete cash fee is received and recorded.",
    tone: "waiting", icon: "calendar",
  },
  "awaiting-bank-transfer": {
    eyebrow: "Application verified",
    title: "Check your email for payment details.",
    message: "Membership begins after the complete bank transfer has been matched and recorded.",
    tone: "waiting", icon: "mail",
  },
  "awaiting-cheque": {
    eyebrow: "Application verified",
    title: "Check your email for cheque details.",
    message: "Membership begins after the cheque has been received, cleared and recorded.",
    tone: "waiting", icon: "mail",
  },
  "guardian-verification": {
    eyebrow: "Applicant email verified",
    title: "Waiting for guardian consent.",
    message: "We sent the guardian a separate secure link. The application will continue after they confirm.",
    tone: "waiting", icon: "mail", allowResend: true,
  },
  "payment-received": {
    eyebrow: "Payment submitted",
    title: "We’re still verifying your payment.",
    message: "Membership and account access will begin as soon as the complete payment has been verified. There is nothing else you need to do.",
    tone: "waiting", icon: "shield",
  },
  "payment-cancelled": {
    eyebrow: "Payment not completed",
    title: "No payment was taken.",
    message: "A secure reminder will be sent later so you can continue from where you stopped.",
    tone: "attention", icon: "shield",
  },
  "payment-unavailable": {
    eyebrow: "Application safely saved",
    title: "Online payment is temporarily unavailable.",
    message: "No payment has been taken. A membership officer has been notified and will contact you if anything else is needed.",
    tone: "attention", icon: "shield",
  },
  "link-invalid": {
    eyebrow: "Link expired",
    title: "This application link can’t be used.",
    message: "Submit a new application to receive a fresh secure verification link.",
    tone: "attention", icon: "shield", primaryLabel: "Start a new application", primaryHref: "/membership/apply",
  },
  "payment-link-invalid": {
    eyebrow: "Link expired",
    title: "This payment link can’t be used.",
    message: "Contact the Society for a replacement payment link. No payment has been taken.",
    tone: "attention", icon: "shield",
  },
};

const planOrder = new Map([["adult", 0], ["concession", 1], ["student", 2], ["junior", 3]]);

export default async function MembershipApplication({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const query = await searchParams;
  const enabled = membershipBillingEnabled();
  if (!enabled) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const outcome = query.application ? applicationOutcomes[query.application] : null;
  if (outcome) {
    const OutcomeIcon = outcome.icon === "mail" ? MailCheck : outcome.icon === "calendar" ? CalendarCheck : ShieldCheck;
    return <PageShell headerTheme="light">
      <main className={`membership-application-result-page is-${outcome.tone}`}>
        <section className="membership-application-result" role="status">
          <span className="membership-result-icon"><OutcomeIcon aria-hidden="true"/></span>
          <p className="eyebrow dark">{outcome.eyebrow}</p>
          <h1>{outcome.title}</h1>
          <p>{outcome.message}</p>
          {outcome.allowResend ? <details className="membership-verification-resend"><summary>Verification email did not arrive?</summary><form action={resendMembershipVerification} className="stack-form"><label>Applicant email<input type="email" name="contact_email" required/></label><CaptchaField/><PendingSubmitButton pendingLabel="Sending…">Send a fresh verification link</PendingSubmitButton></form></details> : null}
          <div className="membership-result-actions">
            {outcome.primaryHref ? <Link className="button dark" href={outcome.primaryHref}>{outcome.primaryLabel} <ArrowRight/></Link> : null}
            <Link className={outcome.primaryHref ? "membership-result-secondary" : "button dark"} href="/membership">Membership overview{!outcome.primaryHref ? <ArrowRight/> : null}</Link>
          </div>
        </section>
      </main>
    </PageShell>;
  }

  const plans = (await getPublicMembershipPlans()).sort((a, b) => (planOrder.get(a.slug) ?? 9) - (planOrder.get(b.slug) ?? 9));
  const paymentSettings = await getMembershipPaymentSettings();
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = query.application ? applicationErrors[query.application] : null;

  return <PageShell headerTheme="light">
    <main className="membership-apply-page">
      <section className="membership-apply-hero">
        <div className="membership-apply-hero-copy">
          <Link className="membership-apply-back" href="/membership"><ArrowLeft/>Membership overview</Link>
          <p className="eyebrow dark">Membership application</p>
          <h1>We’re glad you’re<br/><em>joining us.</em></h1>
          <p>Tell us a little about yourself, choose how you would like to pay, and we’ll guide you through the rest.</p>
        </div>
        <ol className="membership-apply-steps" aria-label="Application steps">
          <li><span>01</span><div><strong>Apply</strong><small>Share your details and we’ll match your membership.</small></div></li>
          <li><span>02</span><div><strong>Verify</strong><small>Open the secure link sent to your email.</small></div></li>
          <li><span>03</span><div><strong>Join</strong><small>Complete payment and receive your confirmation.</small></div></li>
        </ol>
      </section>

      {plans.length ? <section className="membership-apply-layout">
        <aside className="membership-apply-aside">
          <div>
            <p className="eyebrow dark">Before you begin</p>
            <h2>A few useful things to know.</h2>
            <ul>
              <li><CalendarCheck/><span><strong>Calendar-year membership</strong>Paid terms end on 31 December.</span></li>
              <li><MailCheck/><span><strong>Email verification</strong>We verify your address before payment.</span></li>
              <li><WalletCards/><span><strong>Flexible payment</strong>Pay online, by bank transfer, cheque or complete cash payment.</span></li>
              <li><UserRound/><span><strong>Junior applicants</strong>A guardian’s details and consent are required.</span></li>
            </ul>
          </div>
          <div className="membership-apply-help"><strong>Have a membership question?</strong><p>Email <a href={`mailto:${paymentSettings.treasurer_email}`}>{paymentSettings.treasurer_name}</a> before applying.</p></div>
        </aside>

        <div className="membership-application-card">
          {errorMessage ? <p className="form-message error" role="alert">{errorMessage}</p> : null}
          <MembershipApplicationWizard plans={plans.map((plan) => ({
            id: plan.id,
            slug: plan.slug,
            name: plan.name,
            description: plan.description,
            minimum_age: plan.minimum_age,
            maximum_age: plan.maximum_age,
            amount_pence: plan.amount_pence,
            today_amount_pence: proratedMembershipFee(plan.amount_pence),
            membership_year: plan.membership_year,
          }))} today={today} bankTransferAvailable={paymentSettings.configured}/>
        </div>
      </section> : <section className="membership-apply-unavailable">
        <ShieldCheck/>
        <p className="eyebrow dark">Applications continue securely</p>
        <h2>Join or renew through MemberMojo.</h2>
        <p>The Society’s new website application journey is not currently enabled. MemberMojo remains available for applications and renewals.</p>
        <a className="button dark" href={MEMBERMOJO_MEMBERSHIP_URL}>Continue to MemberMojo <ArrowRight/></a>
      </section>}
    </main>
  </PageShell>;
}
