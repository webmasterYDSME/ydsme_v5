import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { membershipAdministrationEnabled } from "@/lib/features";

export const appRoles = ["member", "committee", "administrator"] as const;
export type AppRole = (typeof appRoles)[number];

export const capabilities = [
  "portal.view",
  "profile.manage-own",
  "workshops.reserve-own",
  "notices.create-own",
  "notices.moderate",
  "announcements.manage",
  "events.manage",
  "bookings.manage",
  "workshops.manage",
  "documents.manage",
  "members.view",
  "members.manage",
  "memberships.manage",
  "settings.manage",
  "donations.view",
  "donations.manage",
  "audit.view",
] as const;
export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<AppRole, ReadonlySet<Capability>> = {
  member: new Set(["portal.view", "profile.manage-own", "workshops.reserve-own", "notices.create-own"]),
  committee: new Set([
    "portal.view", "profile.manage-own", "workshops.reserve-own", "notices.create-own",
    "notices.moderate", "announcements.manage", "events.manage", "bookings.manage", "workshops.manage", "documents.manage",
    "members.view",
  ]),
  administrator: new Set(capabilities),
};

export function hasCapability(role: AppRole, capability: Capability) {
  return roleCapabilities[role].has(capability);
}

const membershipOfficerCapabilities: ReadonlySet<Capability> = new Set([
  "memberships.manage",
  "donations.view",
  "donations.manage",
]);

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
});

export const getRole = cache(async (userId: string): Promise<AppRole> => {
  const admin = createAdminClient();
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = data?.role as AppRole | undefined;
  return appRoles.includes(role ?? "member") ? (role ?? "member") : "member";
});

export const isMembershipOfficer = cache(async (userId: string, role: AppRole) => role === "administrator"
  || (role === "committee" && Boolean((await createServiceClient()
    .from("user_capabilities")
    .select("user_id")
    .eq("user_id", userId)
    .eq("capability", "memberships.manage")
    .maybeSingle()).data)));

/** Shown to a signed-in member whose membership has lapsed. The sign-in page recognises it too. */
export const LAPSED_ACCESS_MESSAGE = "Your membership has lapsed, so your access to the members’ area is closed. Please contact the membership officer, who will send you a new link to renew.";

export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const admin = createAdminClient();
  const [{ data: profile }, role] = await Promise.all([
    admin.from("users").select("membership_status,full_name").eq("id", user.id).maybeSingle(),
    getRole(user.id),
  ]);
  // A lapsed member is told why and what to do, not just that access is off.
  if (profile?.membership_status === "lapsed") redirect(`/signin?error=${encodeURIComponent(LAPSED_ACCESS_MESSAGE)}`);
  if (profile?.membership_status !== "active") redirect("/signin?error=Your+Society+access+is+not+active.");
  const membershipOfficer = await isMembershipOfficer(user.id, role);
  return { user, role, fullName: profile.full_name, membershipOfficer };
});

export async function requireRole(allowed: AppRole[]) {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect("/dashboard?notice=not-authorised");
  return session;
}

export async function requireCapability(capability: Capability) {
  const session = await requireUser();
  if (capability === "memberships.manage" && !membershipAdministrationEnabled()) {
    redirect("/dashboard?notice=not-authorised");
  }
  if (!hasCapability(session.role, capability)
    && !(session.membershipOfficer && membershipOfficerCapabilities.has(capability))) {
    redirect("/dashboard?notice=not-authorised");
  }
  return session;
}

export const canManageContent = (role: AppRole) => hasCapability(role, "events.manage");
export const canViewContentManagement = (role: AppRole) => hasCapability(role, "events.manage");
export const isAdministrator = (role: AppRole) => role === "administrator";
