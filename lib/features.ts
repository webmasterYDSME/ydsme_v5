import "server-only";

export const MEMBERMOJO_MEMBERSHIP_URL = "https://membermojo.co.uk/york-model-engineers";

export type MembershipMode = "membermojo" | "pilot" | "live" | "drain";

export function membershipMode(): MembershipMode {
  const configured = process.env.MEMBERSHIP_MODE?.trim().toLowerCase();
  if (configured === "pilot" || configured === "live" || configured === "drain" || configured === "membermojo") {
    return configured;
  }
  return "membermojo";
}

export const membershipPlatformEnabled = () => ["pilot", "live"].includes(membershipMode());

export const membershipAutomationEnabled = membershipPlatformEnabled;

// Drain mode deliberately keeps officer recovery available while stopping new
// public financial work. Signed webhooks remain independently available.
export const membershipBillingEnabled = membershipPlatformEnabled;
export const membershipAdministrationEnabled = () => membershipMode() !== "membermojo";
export const membershipRecoveryEnabled = () => membershipMode() !== "membermojo";
