import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { requireRole, requireUser } from "@/lib/auth";
import { PortalShell } from "@/app/components/PortalShell";

export async function ProtectedArea({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const session = roles ? await requireRole(roles) : await requireUser();
  return <PortalShell role={session.role} name={session.fullName || session.user.email || "Member"} membershipOfficer={session.membershipOfficer}>{children}</PortalShell>;
}
