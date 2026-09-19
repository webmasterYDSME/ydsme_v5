import { requireUser } from "@/lib/auth";
import { membershipBillingEnabled } from "@/lib/features";
import { getMembershipAccount, getOpenMembershipRenewalCampaign } from "@/lib/membership";
import { getOwnNewsletterPreference } from "@/lib/newsletter-preference";
import { createClient } from "@/lib/supabase/server";
import { AccountBanner, type AccountNavItem } from "./_components/AccountBanner";
import { EmailPreferencesSection } from "./_components/EmailPreferencesSection";
import { MembershipSection } from "./_components/MembershipSection";
import { ProfileSection } from "./_components/ProfileSection";
import { SignInSection } from "./_components/SignInSection";
import { UpdatesSection, type AccountNotification } from "./_components/UpdatesSection";
import { accountErrors, accountNotices, genericError, genericNotice } from "./format";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const membershipEnabled = membershipBillingEnabled();

  const [{ data: profile, error: profileError }, membership, newsletter, campaign] = await Promise.all([
    supabase.from("users").select("title,full_name,email,contact_number").eq("id", user.id).single(),
    membershipEnabled ? getMembershipAccount(user.id) : Promise.resolve(null),
    getOwnNewsletterPreference(),
    getOpenMembershipRenewalCampaign(),
  ]);
  if (profileError) throw new Error("Unable to load account details.");

  const { data: notifications, error: notificationError } = membershipEnabled
    ? await supabase.rpc("get_own_membership_notifications", { p_limit: 20 })
    : { data: [], error: null };
  if (notificationError) throw new Error("Unable to load membership notifications.");

  const renewalAvailable = Boolean(campaign && !membership?.history.some((term) => term.membership_year === campaign.membership_year && term.status === "paid"));
  const honoraryTransitionPayment = Boolean(membership?.member.effective_state === "honorary"
    && membership.honorary?.revoked_effective_on && membership.honorary.replacement_plan_id);

  const isNewsletterKey = (key?: string) => Boolean(key?.startsWith("newsletter-"));
  const newsletterMessage = isNewsletterKey(query.error)
    ? { tone: "error" as const, text: accountErrors[query.error!] || genericError }
    : isNewsletterKey(query.notice) ? { tone: "success" as const, text: accountNotices[query.notice!] || genericNotice } : null;

  const nav: AccountNavItem[] = [
    ...(membershipEnabled ? [{ id: "membership", label: "Membership" }] : []),
    { id: "profile", label: "Your details" },
    { id: "sign-in", label: "Sign-in and contact" },
    { id: "email-preferences", label: "Email preferences" },
    ...(membershipEnabled ? [{ id: "updates", label: "Updates" }] : []),
  ];

  return <div className="portal-content narrow">
    <div className={styles.page}>
      <AccountBanner
        name={profile.full_name || profile.email}
        email={profile.email}
        role={role}
        membershipState={membership?.member.effective_state ?? null}
        nav={nav}
      />
      {query.error && !isNewsletterKey(query.error) ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{accountErrors[query.error] || genericError}</p> : null}
      {query.notice && !isNewsletterKey(query.notice) ? <p className={`${styles.message} ${styles.messageSuccess}`} role="status">{accountNotices[query.notice] || genericNotice}</p> : null}

      {membershipEnabled ? <MembershipSection
        membership={membership}
        campaignYear={campaign?.membership_year ?? null}
        renewalAvailable={renewalAvailable}
        honoraryTransitionPayment={honoraryTransitionPayment}
      /> : null}
      <ProfileSection title={profile.title || ""} fullName={profile.full_name || ""} contactNumber={profile.contact_number || ""}/>
      <SignInSection
        loginEmail={profile.email}
        correspondence={membership ? { email: membership.member.contact_email ?? "", role: membership.member.contact_role } : null}
        memberMojoLink={!membershipEnabled}
      />
      <EmailPreferencesSection newsletter={newsletter} message={newsletterMessage}/>
      {membershipEnabled ? <UpdatesSection notifications={(notifications ?? []) as AccountNotification[]}/> : null}
    </div>
  </div>;
}
