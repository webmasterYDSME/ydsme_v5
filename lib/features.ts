import "server-only";

export const MEMBERMOJO_MEMBERSHIP_URL = "https://membermojo.co.uk/york-model-engineers";

// "membermojo": MemberMojo is still the membership system. The website's apply, checkout and renew
// pages send people to MemberMojo and the membership area is hidden; only the member-list import is used.
// "website": the website runs membership itself. The older values pilot, live and drain mean the same.
export type MembershipMode = "membermojo" | "website";

export function membershipMode(): MembershipMode {
  const configured = process.env.MEMBERSHIP_MODE?.trim().toLowerCase();
  if (configured === "website" || configured === "pilot" || configured === "live" || configured === "drain") return "website";
  return "membermojo";
}

export const membershipPlatformEnabled = () => membershipMode() === "website";

export const membershipAutomationEnabled = membershipPlatformEnabled;
export const membershipBillingEnabled = membershipPlatformEnabled;
export const membershipAdministrationEnabled = membershipPlatformEnabled;
export const membershipRecoveryEnabled = membershipPlatformEnabled;
