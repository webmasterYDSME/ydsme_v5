import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { requireRole, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PortalShell } from "@/app/components/PortalShell";

export async function ProtectedArea({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const session = roles ? await requireRole(roles) : await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("full_name").eq("id", session.user.id).maybeSingle();
  return <PortalShell role={session.role} name={data?.full_name || session.user.email || "Member"}>{children}</PortalShell>;
}
