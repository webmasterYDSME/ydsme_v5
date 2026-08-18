import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  "members.manage",
  "settings.manage",
  "donations.view",
  "audit.view",
] as const;
export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<AppRole, ReadonlySet<Capability>> = {
  member: new Set(["portal.view", "profile.manage-own", "workshops.reserve-own", "notices.create-own"]),
  committee: new Set([
    "portal.view", "profile.manage-own", "workshops.reserve-own", "notices.create-own",
    "notices.moderate", "announcements.manage", "events.manage", "bookings.manage", "workshops.manage", "documents.manage",
  ]),
  administrator: new Set(capabilities),
};

export function hasCapability(role: AppRole, capability: Capability) {
  return roleCapabilities[role].has(capability);
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}

export async function getRole(userId: string): Promise<AppRole> {
  const admin = createAdminClient();
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = data?.role as AppRole | undefined;
  return appRoles.includes(role ?? "member") ? (role ?? "member") : "member";
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const admin = createAdminClient();
  const [{ data: profile }, role] = await Promise.all([
    admin.from("users").select("membership_status").eq("id", user.id).maybeSingle(),
    getRole(user.id),
  ]);
  if (profile?.membership_status !== "active") redirect("/signin?error=Your+Society+access+is+not+active.");
  return { user, role };
}

export async function requireRole(allowed: AppRole[]) {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect("/dashboard?notice=not-authorised");
  return session;
}

export async function requireCapability(capability: Capability) {
  const session = await requireUser();
  if (!hasCapability(session.role, capability)) redirect("/dashboard?notice=not-authorised");
  return session;
}

export const canManageContent = (role: AppRole) => hasCapability(role, "events.manage");
export const canViewContentManagement = (role: AppRole) => hasCapability(role, "events.manage");
export const isAdministrator = (role: AppRole) => role === "administrator";
