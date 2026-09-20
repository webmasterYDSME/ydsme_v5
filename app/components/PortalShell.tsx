import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { AppRole } from "@/lib/auth";
import { canViewContentManagement, isAdministrator } from "@/lib/auth";
import { PortalNavigation } from "@/app/components/PortalNavigation";
import { getMembershipNavigationTaskCount } from "@/lib/portal-navigation";
import { buildPortalNav, portalSidebarCollapsed, portalSidebarCookie, roleLabel } from "@/lib/portal-nav";
import { membershipAdministrationEnabled, membershipBillingEnabled } from "@/lib/features";
import { getOwnNotifications } from "@/lib/member-notifications";
import { NotificationList } from "@/app/components/NotificationList";

export async function PortalShell({ children, role, name, membershipOfficer = false }: { children: ReactNode; role: AppRole; name: string; membershipOfficer?: boolean }) {
  const membershipEnabled = membershipAdministrationEnabled();
  const showNotifications = membershipBillingEnabled();
  const [membershipTaskCount, cookieStore, own] = await Promise.all([
    membershipOfficer && membershipEnabled ? getMembershipNavigationTaskCount() : 0,
    cookies(),
    getOwnNotifications(),
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
      unreadNotifications={own.unread}
      notificationPanel={showNotifications ? <NotificationList notifications={own.notifications}/> : null}
    />
    <main className="portal-main">{children}</main>
  </div>;
}
