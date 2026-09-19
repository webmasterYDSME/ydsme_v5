import { requireUser } from "@/lib/auth";
import { membershipBillingEnabled } from "@/lib/features";
import { getOwnMemberDetails } from "@/lib/member-details";
import { getMembershipAccount, getOpenMembershipRenewalCampaign } from "@/lib/membership";
import { getOwnNewsletterPreference } from "@/lib/newsletter-preference";
import { createClient } from "@/lib/supabase/server";
import { AccountBanner, type AccountNavItem } from "./_components/AccountBanner";
import { AddressSection } from "./_components/AddressSection";
import { EmailPreferencesSection } from "./_components/EmailPreferencesSection";
import { MembershipSection } from "./_components/MembershipSection";
import { NotificationsSection, type AccountNotification } from "./_components/NotificationsSection";
import { ProfileSection } from "./_components/ProfileSection";
import { SignInSection } from "./_components/SignInSection";
import { accountErrors, accountNotices, genericError, genericNotice, londonToday, sectionMessage } from "./format";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

/** Messages for these sections appear inside the section, so they are left out of the general message at the top. */
const sectionPrefixes = ["newsletter-", "address-"];
const belongsToSection = (key?: string) => Boolean(key && sectionPrefixes.some((prefix) => key.startsWith(prefix)));

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const membershipEnabled = membershipBillingEnabled();

  const [{ data: profile, error: profileError }, membership, newsletter, details, campaign] = await Promise.all([
    supabase.from("users").select("title,full_name,email,contact_number").eq("id", user.id).single(),
    membershipEnabled ? getMembershipAccount(user.id) : Promise.resolve(null),
    getOwnNewsletterPreference(),
    getOwnMemberDetails(),
    getOpenMembershipRenewalCampaign(),
  ]);
  if (profileError) throw new Error("Unable to load account details.");

  const { data: notificationRows, error: notificationError } = membershipEnabled
    ? await supabase.rpc("get_own_membership_notifications", { p_limit: 30 })
    : { data: [], error: null };
  if (notificationError) throw new Error("Unable to load membership notifications.");
  const notifications = (notificationRows ?? []) as AccountNotification[];
  const unreadNotifications = notifications.filter((notice) => !notice.read_at).length;

  const renewalAvailable = Boolean(campaign && !membership?.history.some((term) => term.membership_year === campaign.membership_year && term.status === "paid"));
  const honoraryTransitionPayment = Boolean(membership?.member.effective_state === "honorary"
    && membership.honorary?.revoked_effective_on && membership.honorary.replacement_plan_id);

  const nav: AccountNavItem[] = [
    ...(membershipEnabled ? [{ id: "membership", label: "Membership" }, { id: "notifications", label: "Notifications" }] : []),
    { id: "profile", label: "Your details" },
    { id: "address", label: "Address" },
    { id: "email-preferences", label: "Email preferences" },
    { id: "sign-in", label: "Sign-in and contact" },
  ];

  return <div className="portal-content">
    <div className={styles.page}>
      <AccountBanner
        name={profile.full_name || profile.email}
        email={profile.email}
        role={role}
        membershipState={membership?.member.effective_state ?? null}
        unreadNotifications={unreadNotifications}
        nav={nav}
      />
      {query.error && !belongsToSection(query.error) ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{accountErrors[query.error] || genericError}</p> : null}
      {query.notice && !belongsToSection(query.notice) ? <p className={`${styles.message} ${styles.messageSuccess}`} role="status">{accountNotices[query.notice] || genericNotice}</p> : null}

      <div className={styles.layout}>
        {membershipEnabled ? <MembershipSection
          membership={membership}
          campaignYear={campaign?.membership_year ?? null}
          renewalAvailable={renewalAvailable}
          honoraryTransitionPayment={honoraryTransitionPayment}
        /> : null}
        {membershipEnabled ? <NotificationsSection notifications={notifications}/> : null}
        <ProfileSection title={profile.title || ""} fullName={profile.full_name || ""} contactNumber={profile.contact_number || ""}/>
        <AddressSection details={details} message={sectionMessage(query, "address-")} today={londonToday()}/>
        <EmailPreferencesSection newsletter={newsletter} message={sectionMessage(query, "newsletter-")}/>
        <SignInSection
          loginEmail={profile.email}
          correspondence={membership ? { email: membership.member.contact_email ?? "", role: membership.member.contact_role } : null}
          memberMojoLink={!membershipEnabled}
        />
      </div>
    </div>
  </div>;
}
