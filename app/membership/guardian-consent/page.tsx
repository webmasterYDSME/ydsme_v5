import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { PageShell } from "@/app/components/PageShell";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { confirmGuardianMembershipConsent } from "@/lib/actions/membership";
import { publicPageMetadata } from "@/lib/seo";
import { redirect } from "next/navigation";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import styles from "./consent.module.css";

export const metadata = publicPageMetadata({
  title: "Guardian Consent",
  description: "Confirm consent for a junior Society membership application.",
  path: "/membership/guardian-consent",
});

export default async function GuardianConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; consent?: string }>;
}) {
  if (!(await membershipBillingEnabled())) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const query = await searchParams;
  const token = query.token && query.token.length >= 20 && query.token.length <= 200 ? query.token : null;
  const confirmed = query.consent === "confirmed";
  const invalid = query.consent === "link-invalid" || (!token && !confirmed);

  return <PageShell headerTheme="light"><div className={`membership-consent-page ${styles.consent}`}>
    <section className="membership-consent-card" aria-labelledby="consent-title">
      <Link className="membership-apply-back" href="/membership"><ArrowLeft/>Membership overview</Link>
      {confirmed ? <>
        <CheckCircle2 className="membership-consent-icon"/>
        <p className="eyebrow dark">Consent confirmed</p>
        <h1 id="consent-title">Thank you.</h1>
        <p>The junior application is ready for a membership officer to review before payment.</p>
      </> : invalid ? <>
        <ShieldCheck className="membership-consent-icon"/>
        <p className="eyebrow dark">Link unavailable</p>
        <h1 id="consent-title">This consent link has expired.</h1>
        <p>Ask the applicant to contact the Society Treasurer for a replacement.</p>
      </> : <>
        <ShieldCheck className="membership-consent-icon"/>
        <p className="eyebrow dark">Junior membership</p>
        <h1 id="consent-title">Confirm guardian consent.</h1>
        <p>By confirming, you agree that the junior applicant may apply for Society membership and that membership-related financial notices may be sent to the guardian email supplied.</p>
        <form action={confirmGuardianMembershipConsent}>
          <input type="hidden" name="token" value={token ?? ""}/>
          <PendingSubmitButton className="button dark" pendingLabel="Confirming…">I confirm my consent</PendingSubmitButton>
        </form>
      </>}
    </section>
  </div></PageShell>;
}
