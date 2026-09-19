import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { AppRole } from "@/lib/auth";
import { canViewContentManagement, isAdministrator } from "@/lib/auth";
import { PortalNavigation } from "@/app/components/PortalNavigation";
import { getMembershipNavigationTaskCount } from "@/lib/portal-navigation";
import { buildPortalNav, portalSidebarCollapsed, portalSidebarCookie, roleLabel } from "@/lib/portal-nav";
import { membershipAdministrationEnabled } from "@/lib/features";

export async function PortalShell({ children, role, name, membershipOfficer = false }: { children: ReactNode; role: AppRole; name: string; membershipOfficer?: boolean }) {
  const membershipEnabled = membershipAdministrationEnabled();
  const [membershipTaskCount, cookieStore] = await Promise.all([
    membershipOfficer && membershipEnabled ? getMembershipNavigationTaskCount() : 0,
    cookies(),
  ]);
  const sections = buildPortalNav({
    role,
    canViewContent: canViewContentManagement(role),
    administrator: isAdministrator(role),
    membershipOfficer,
    membershipEnabled,
    membershipTaskCount,
  });
  return <div className="portal-shell">
    <PortalNavigation
      sections={sections}
      name={name}
      roleLabel={roleLabel(role, membershipOfficer)}
      initialCollapsed={cookieStore.get(portalSidebarCookie)?.value === portalSidebarCollapsed}
      canSearchMembers={membershipOfficer && membershipEnabled}
    />
    <main className="portal-main">{children}</main>
  </div>;
}
