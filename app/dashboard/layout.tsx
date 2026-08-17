import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PortalShell } from "@/app/components/PortalShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role } = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  return <PortalShell role={role} name={profile?.full_name || user.email || "Member"}>{children}</PortalShell>;
}
