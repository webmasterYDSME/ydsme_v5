import { CheckCircle2, Clock3, MailCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { membershipTokenHash } from "@/lib/membership";
import { createServiceClient } from "@/lib/supabase/admin";
import { PageShell } from "@/app/components/PageShell";
import styles from "../confirmation.module.css";

export const dynamic = "force-dynamic";

const statusCopy: Record<string, { title: string; body: string }> = {
  email_verification_pending: {
    title: "Email confirmation needed",
    body: "Open the verification email for this application. A new link can be requested from the application page if it has expired.",
  },
  guardian_verification_pending: {
    title: "Guardian confirmation needed",
    body: "The application is waiting for the named guardian to confirm their email address and consent.",
  },
  awaiting_approval: {
    title: "Application being reviewed",
    body: "A membership officer will review the application. The next email will explain the decision or anything else that is needed.",
  },
  awaiting_payment: {
    title: "Payment is the next step",
    body: "Use the latest secure payment email. Membership starts only after the complete payment has been verified.",
  },
  awaiting_cash: { title: "Waiting for cash payment", body: "A membership officer will activate membership after confirming the complete payment." },
  awaiting_bank_transfer: { title: "Waiting for bank transfer", body: "A membership officer will activate membership after confirming the complete payment." },
  awaiting_cheque: { title: "Waiting for the cheque to clear", body: "The application remains open while the cheque is received and cleared." },
  rejected: { title: "Application not approved", body: "The decision email explains the outcome and how to contact the membership officer." },
  converted: { title: "Membership active", body: "The complete payment or honorary membership has been confirmed. If an individual login email is available, a separate email will explain how to access the member area." },
  expired: { title: "Application expired", body: "No membership or payment was created. Contact the membership officer before starting again if help is needed." },
};

export default async function MembershipStatus({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const token = (await searchParams).token ?? "";
  if (token.length < 20 || token.length > 200) redirect("/membership/apply?application=status-link-invalid");
  const { data, error } = await createServiceClient().from("membership_applications")
    .select("full_name,status,application_status_expires_at,membership_plans(name)")
    .eq("application_status_token_hash", membershipTokenHash(token)).maybeSingle();
  if (error || !data || !data.application_status_expires_at
    || new Date(data.application_status_expires_at) <= new Date()) {
    redirect("/membership/apply?application=status-link-invalid");
  }
  const copy = statusCopy[data.status] ?? {
    title: "Application saved",
    body: "The membership officer has the application and will send an email when the next action is ready.",
  };
  const plan = Array.isArray(data.membership_plans) ? data.membership_plans[0] : data.membership_plans;
  return <PageShell headerTheme="light"><div className={styles.page}>
    <section className={styles.card} aria-labelledby="membership-status-title">
      <div className={styles.icon} aria-hidden="true">{data.status === "converted" ? <CheckCircle2/> : <MailCheck/>}</div>
      <p className="eyebrow dark">{data.full_name} · {plan?.name || "Membership"}</p>
      <h1 id="membership-status-title">{copy.title}</h1>
      <p>{copy.body}</p>
      <div className={styles.note}><Clock3 aria-hidden="true"/><span>This secure status link relates only to {data.full_name} and expires after 30 days.</span></div>
      {data.status === "converted" ? <a className="button dark" href="/signin?next=/account"><CheckCircle2/>Sign in to your account</a> : <a className="button outline" href="/membership">Membership information</a>}
    </section>
  </div></PageShell>;
}
