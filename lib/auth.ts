import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const appRoles = ["administrator", "committee", "read-only-committee", "member"] as const;
export type AppRole = (typeof appRoles)[number];

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
  return { user, role: await getRole(user.id) };
}

export async function requireRole(allowed: AppRole[]) {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect("/dashboard?notice=not-authorised");
  return session;
}

export const canManageContent = (role: AppRole) => role === "administrator" || role === "committee";
export const canViewContentManagement = (role: AppRole) => canManageContent(role) || role === "read-only-committee";
export const isAdministrator = (role: AppRole) => role === "administrator";
