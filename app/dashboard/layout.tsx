import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/app/components/PortalShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role, fullName } = await requireUser();
  return <PortalShell role={role} name={fullName || user.email || "Member"}>{children}</PortalShell>;
}
