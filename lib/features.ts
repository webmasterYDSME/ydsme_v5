import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";

export const MEMBERMOJO_MEMBERSHIP_URL = "https://membermojo.co.uk/york-model-engineers";

// "membermojo": MemberMojo is still the membership system. The website's apply, checkout and renew
// pages send people to MemberMojo and the membership area is hidden; only the member-list import is used.
// "website": the website runs membership itself.
//
// An administrator changes this at Administrator > Membership system; it is stored in the database, not in
// an environment variable, and the web app and both edge functions read the same row. Every check below is
// async, so it must be awaited: a forgotten await would be a Promise, which is always truthy, and would
// switch the website on. tests/membership-mode.test.mjs fails if any call is left without one.
export type MembershipMode = "membermojo" | "website";

/** One small lookup per request. If it cannot be read, MemberMojo is assumed, so nothing is charged or emailed. */
export const membershipMode = cache(async (): Promise<MembershipMode> => {
  try {
    const { data, error } = await createServiceClient().rpc("membership_mode");
    if (!error && data === "website") return "website";
  } catch {
    // Falls through to the safe mode.
  }
  return "membermojo";
});

export const membershipPlatformEnabled = async () => (await membershipMode()) === "website";

export const membershipAutomationEnabled = membershipPlatformEnabled;
export const membershipBillingEnabled = membershipPlatformEnabled;
export const membershipAdministrationEnabled = membershipPlatformEnabled;
export const membershipRecoveryEnabled = membershipPlatformEnabled;
