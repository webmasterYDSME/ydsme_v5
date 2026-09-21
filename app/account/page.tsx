import { requireUser } from "@/lib/auth";
import { membershipBillingEnabled } from "@/lib/features";
import { getOwnMemberDetails } from "@/lib/member-details";
import { getMembershipAccount, getOpenMembershipRenewalCampaign } from "@/lib/membership";
import { getOwnNewsletterPreference } from "@/lib/newsletter-preference";
import { createClient } from "@/lib/supabase/server";
import { AccountHeader, type AccountTabLink } from "./_components/AccountHeader";
import { AddressSection } from "./_components/AddressSection";
import { EmailPreferencesSection } from "./_components/EmailPreferencesSection";
import { MembershipSection } from "./_components/MembershipSection";
import { ProfileSection } from "./_components/ProfileSection";
import { SignInSection } from "./_components/SignInSection";
import { accountErrors, accountNotices, accountTabLabels, genericError, genericNotice, londonToday, pickAccountTab, sectionMessage, type AccountTab } from "./format";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

/** Messages for these sections appear inside the section, so they are left out of the general message at the top. */
const sectionPrefixes = ["newsletter-", "address-"];
const belongsToSection = (key?: string) => Boolean(key && sectionPrefixes.some((prefix) => key.startsWith(prefix)));

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; tab?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const membershipEnabled = await membershipBillingEnabled();

  const [{ data: profile, error: profileError }, membership, newsletter, details, campaign] = await Promise.all([
    supabase.from("users").select("title,full_name,email,contact_number").eq("id", user.id).single(),
    membershipEnabled ? getMembershipAccount(user.id) : Promise.resolve(null),
    getOwnNewsletterPreference(),
    getOwnMemberDetails(),
    getOpenMembershipRenewalCampaign(),
  ]);
  if (profileError) throw new Error("Unable to load account details.");

  const renewalAvailable = Boolean(campaign && !membership?.history.some((term) => term.membership_year === campaign.membership_year && term.status === "paid"));
  const honoraryTransitionPayment = Boolean(membership?.member.effective_state === "honorary"
    && membership.honorary?.revoked_effective_on && membership.honorary.replacement_plan_id);

  const current = pickAccountTab(query, membershipEnabled);
  const tabs: AccountTabLink[] = (membershipEnabled ? ["membership", "details", "settings"] as AccountTab[] : ["details", "settings"] as AccountTab[]).map((id) => ({
    id,
    label: accountTabLabels[id],
    href: `/account?tab=${id}`,
    current: id === current,
  }));

  return <div className="portal-content">
    <div className={styles.page}>
      <AccountHeader
        name={profile.full_name || profile.email}
        email={profile.email}
        role={role}
        membershipState={membership?.member.effective_state ?? null}
        tabs={tabs}
      />
      {query.error && !belongsToSection(query.error) ? <p className="form-message error" role="alert">{accountErrors[query.error] || genericError}</p> : null}
      {query.notice && !belongsToSection(query.notice) ? <p className="form-message success" role="status">{accountNotices[query.notice] || genericNotice}</p> : null}

      <div className={styles.sections}>
        {current === "membership" ? <MembershipSection
          membership={membership}
          campaignYear={campaign?.membership_year ?? null}
          renewalAvailable={renewalAvailable}
          honoraryTransitionPayment={honoraryTransitionPayment}
        /> : null}
        {current === "details" ? <div className={styles.pair}>
          <ProfileSection title={profile.title || ""} fullName={profile.full_name || ""} contactNumber={profile.contact_number || ""}/>
          <AddressSection details={details} message={sectionMessage(query, "address-")} today={londonToday()}/>
        </div> : null}
        {current === "settings" ? <div className={styles.pair}>
          <EmailPreferencesSection newsletter={newsletter} message={sectionMessage(query, "newsletter-")}/>
          <SignInSection
            loginEmail={profile.email}
            correspondence={membership ? { email: membership.member.contact_email ?? "", role: membership.member.contact_role } : null}
            memberMojoLink={!membershipEnabled}
          />
        </div> : null}
      </div>
    </div>
  </div>;
}
