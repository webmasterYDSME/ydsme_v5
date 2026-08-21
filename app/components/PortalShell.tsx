import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { canViewContentManagement, isAdministrator } from "@/lib/auth";
import { PortalNavigation } from "@/app/components/PortalNavigation";
import { getMembershipNavigationTaskCount } from "@/lib/portal-navigation";

export async function PortalShell({ children, role, name, membershipOfficer = false }: { children: ReactNode; role: AppRole; name: string; membershipOfficer?: boolean }) {
  const membershipTaskCount = membershipOfficer ? await getMembershipNavigationTaskCount() : 0;
  return <div className="portal-shell"><PortalNavigation role={role} name={name} canViewContent={canViewContentManagement(role)} administrator={isAdministrator(role)} membershipOfficer={membershipOfficer} membershipTaskCount={membershipTaskCount}/><main className="portal-main">{children}</main></div>;
}
