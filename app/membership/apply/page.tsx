import { getSignupVerification } from "@/lib/membership-signup-session";
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
import { ensureMembershipPlanPrice, getPublicMembershipPlans, membershipBillingYear, membershipTokenHash, proratedMembershipFee } from "@/lib/membership";
import { getMembershipPaymentSettings, getPublicMembershipPaymentContact } from "@/lib/membership-settings";
import { createServiceClient } from "@/lib/supabase/admin";
import { publicPageMetadata } from "@/lib/seo";
import styles from "./application.module.css";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Apply for Membership",
  description: "Apply to join York Model Engineers and choose online payment, cash, bank transfer or cheque.",
  path: "/membership/apply",
  keywords: ["York Model Engineers application", "join York Model Engineers"],
});

const applicationErrors: Record<string, string> = {
  "save-failed": "We could not save your application. Your verified draft is still available below. Please try again.",
  "verification-required": "Verify the correspondence email with Get code before continuing.",
  "contact-officer": "Please contact the membership officer about your existing membership application.",
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
  "already-member": { eyebrow: "Membership found", title: "You already have a membership record", message: "No new joining payment is needed. Sign in to check your membership or contact the officer to arrange renewal or help with access.", tone: "success", icon: "shield", primaryLabel: "Your account", primaryHref: "/account" },
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
    title: "Thank you for applying for Society membership.",
    message: "Below are the details for paying by cash.",
    tone: "waiting", icon: "calendar",
  },
  "awaiting-bank-transfer": {
    eyebrow: "Application verified",
    title: "Thank you for applying for Society membership.",
    message: "Below are the Society’s bank details.",
    tone: "waiting", icon: "mail",
  },
  "awaiting-cheque": {
    eyebrow: "Application verified",
    title: "Thank you for applying for Society membership.",
    message: "Below are the details for paying by cheque.",
    tone: "waiting", icon: "mail",
  },
  "guardian-verification": {
    eyebrow: "Applicant email verified",
    title: "Waiting for guardian consent.",
    message: "We sent the guardian a separate secure link. The application will continue after they confirm.",
    tone: "waiting", icon: "mail", allowResend: true,
  },
  "payment-received": {
    eyebrow: "Application received",
    title: "Thank you for applying for Society membership.",
    message: "We’ll email you soon with your membership details and information about website access.",
    tone: "success", icon: "mail",
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

const paymentMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const offlineOutcomeMethods = {
  "awaiting-bank-transfer": "bank_transfer",
  "awaiting-cash": "cash",
  "awaiting-cheque": "cheque",
} as const;
type OfflinePaymentMethod = typeof offlineOutcomeMethods[keyof typeof offlineOutcomeMethods];

export default async function MembershipApplication({ searchParams }: { searchParams: Promise<{ application?: string; token?: string }> }) {
  const query = await searchParams;
  const signup = await getSignupVerification();
  const enabled = await membershipBillingEnabled();
  if (!enabled) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const outcome = query.application ? applicationOutcomes[query.application] : null;
  const offlinePaymentMethod = query.application && query.application in offlineOutcomeMethods
    ? offlineOutcomeMethods[query.application as keyof typeof offlineOutcomeMethods]
    : null;
  let offlinePaymentDetails: null | {
    method: OfflinePaymentMethod;
    amountPence: number;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    applicantName: string;
    chequePayee: string;
    chequeDeliveryInstructions: string;
    cashInstructions: string;
  } = null;
  if (offlinePaymentMethod && query.token && query.token.length >= 20 && query.token.length <= 200) {
    const tokenHash = membershipTokenHash(query.token);
    const { data: application } = await createServiceClient().from("membership_applications")
      .select("full_name,status,requested_plan_id,payment_settings_version_id,application_status_expires_at,created_at")
      .or(`application_status_token_hash.eq.${tokenHash},verification_token_hash.eq.${tokenHash}`)
      .eq("status", `awaiting_${offlinePaymentMethod}`)
      .maybeSingle();
    if (application?.application_status_expires_at && new Date(application.application_status_expires_at) > new Date()) {
      const pricingDate = new Date(application.created_at);
      const [settings, price] = await Promise.all([
        getMembershipPaymentSettings(application.payment_settings_version_id),
        ensureMembershipPlanPrice(application.requested_plan_id, membershipBillingYear(pricingDate)).catch(() => null),
      ]);
      if (price) offlinePaymentDetails = {
        method: offlinePaymentMethod,
        amountPence: proratedMembershipFee(price.amount_pence, pricingDate),
        accountName: settings.bank_account_name,
        sortCode: settings.bank_sort_code,
        accountNumber: settings.bank_account_number,
        applicantName: application.full_name,
        chequePayee: settings.cheque_payee,
        chequeDeliveryInstructions: settings.cheque_delivery_instructions,
        cashInstructions: settings.cash_instructions,
      };
    }
  }
  if (outcome) {
    const OutcomeIcon = outcome.icon === "mail" ? MailCheck : outcome.icon === "calendar" ? CalendarCheck : ShieldCheck;
    return <PageShell headerTheme="light">
      <div className={`membership-application-result-page is-${outcome.tone} ${styles.application}`}>
        <section className="membership-application-result" role="status">
          <span className="membership-result-icon"><OutcomeIcon aria-hidden="true"/></span>
          <p className="eyebrow dark">{outcome.eyebrow}</p>
          <h1>{outcome.title}</h1>
          <p>{offlinePaymentMethod && !offlinePaymentDetails
            ? "We’ll email you the amount and payment details."
            : outcome.message}</p>
          {offlinePaymentDetails ? <div className={styles.offlinePaymentDetails}>
            <h2>{offlinePaymentDetails.method === "bank_transfer" ? "Bank transfer details"
              : offlinePaymentDetails.method === "cheque" ? "Cheque payment details" : "Cash payment details"}</h2>
            <dl>
              <div><dt>Amount</dt><dd>{paymentMoney.format(offlinePaymentDetails.amountPence / 100)}</dd></div>
              {offlinePaymentDetails.method === "bank_transfer" ? <>
                <div><dt>Account name</dt><dd>{offlinePaymentDetails.accountName}</dd></div>
                <div><dt>Account number</dt><dd>{offlinePaymentDetails.accountNumber}</dd></div>
                <div><dt>Sort code</dt><dd>{offlinePaymentDetails.sortCode}</dd></div>
                <div><dt>Payment reference</dt><dd>{offlinePaymentDetails.applicantName}</dd></div>
              </> : offlinePaymentDetails.method === "cheque" ? <>
                <div><dt>Payable to</dt><dd>{offlinePaymentDetails.chequePayee}</dd></div>
                <div><dt>Applicant’s full name to write on the back of the cheque</dt><dd>{offlinePaymentDetails.applicantName}</dd></div>
                <div><dt>How to deliver it</dt><dd>{offlinePaymentDetails.chequeDeliveryInstructions}</dd></div>
              </> : <>
                <div><dt>Member name</dt><dd>{offlinePaymentDetails.applicantName}</dd></div>
                <div><dt>How to pay</dt><dd>{offlinePaymentDetails.cashInstructions}</dd></div>
              </>}
            </dl>
            {offlinePaymentDetails.method === "bank_transfer" ? <p>Enter your full name as the payment reference.</p> : null}
            <p>We’ll also email you these details.</p>
            <p>{offlinePaymentDetails.method === "cheque"
              ? "Your membership will be activated after the cheque has been received, cleared and recorded."
              : offlinePaymentDetails.method === "cash"
                ? "Your membership will be activated after the cash payment has been received and recorded."
                : "Your membership will be activated after the bank transfer has been received and recorded."}</p>
          </div> : null}
          {outcome.allowResend ? <details className="membership-verification-resend"><summary>Verification email did not arrive?</summary><form action={resendMembershipVerification} className="stack-form"><label>Applicant email<input type="email" name="contact_email" maxLength={254} required/></label><CaptchaField/><PendingSubmitButton pendingLabel="Sending…">Send a fresh verification link</PendingSubmitButton></form></details> : null}
          <div className="membership-result-actions">
            {outcome.primaryHref ? <Link className="button dark" href={outcome.primaryHref}>{outcome.primaryLabel} <ArrowRight/></Link> : null}
            <Link className={outcome.primaryHref ? "membership-result-secondary" : "button dark"} href="/membership">Membership overview{!outcome.primaryHref ? <ArrowRight/> : null}</Link>
          </div>
        </section>
      </div>
    </PageShell>;
  }

  const [availablePlans, paymentSettings] = await Promise.all([
    getPublicMembershipPlans(),
    getPublicMembershipPaymentContact(),
  ]);
  const plans = [...availablePlans].sort((a, b) => (planOrder.get(a.slug) ?? 9) - (planOrder.get(b.slug) ?? 9));
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = query.application ? applicationErrors[query.application] : null;
  const initialDraft = signup && !signup.application_id && signup.draft && typeof signup.draft === "object" && !Array.isArray(signup.draft)
    ? Object.fromEntries(Object.entries(signup.draft).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : undefined;
  const restoredEmail = initialDraft?.guardian_led === "on" ? initialDraft.guardian_email : initialDraft?.contact_email;
  const initiallyVerified = Boolean(
    signup
    && initialDraft?.full_name?.trim().replace(/\s+/g, " ").toLowerCase() === signup.full_name
    && restoredEmail?.trim().toLowerCase() === signup.email,
  );

  return <PageShell headerTheme="light">
    <div className={`membership-apply-page ${styles.application}`}>
      <section className="membership-apply-intro">
        <div className="membership-apply-intro-inner">
          <div className="membership-apply-heading-row">
            <Link className="membership-apply-back" href="/membership"> <ArrowLeft/>Membership overview</Link>
            <h1>Join the <em>Society.</em></h1>
          </div>
          <ul className="membership-apply-facts" aria-label="Before you begin">
            <li><MailCheck/><span><strong>Everyone is welcome</strong>Join our friendly community and enjoy everything Society membership has to offer.</span></li>
            <li><WalletCards/><span><strong>Flexible payment</strong>Pay online, by bank transfer, cheque or cash.</span></li>
            <li><CalendarCheck/><span><strong>Calendar-year membership</strong>Paid terms end on 31 December.</span></li>
          </ul>
          <p className="membership-apply-junior"><UserRound aria-hidden="true"/><span><strong>Applying for a junior?</strong> A guardian’s details and consent are needed.</span></p>
        </div>
      </section>

      {plans.length ? <section className="membership-apply-workspace">
        <div className="membership-apply-workspace-inner">
          <div className="membership-application-card">
            {errorMessage ? <p className="form-message error" role="alert">{errorMessage}</p> : null}
            <MembershipApplicationWizard initialDraft={initialDraft} initiallyVerified={initiallyVerified} plans={plans.map((plan) => ({
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
          <p className="membership-apply-help"><strong>Need help with membership?</strong> Email <a href={`mailto:${paymentSettings.treasurer_email}`}>Membership Officer</a>.</p>
        </div>
      </section> : <section className="membership-apply-unavailable">
        <ShieldCheck/>
        <p className="eyebrow dark">Applications continue securely</p>
        <h2>Join or renew through MemberMojo.</h2>
        <p>The Society’s new website application journey is not currently enabled. MemberMojo remains available for applications and renewals.</p>
        <a className="button dark" href={MEMBERMOJO_MEMBERSHIP_URL}>Continue to MemberMojo <ArrowRight/></a>
      </section>}
    </div>
  </PageShell>;
}
