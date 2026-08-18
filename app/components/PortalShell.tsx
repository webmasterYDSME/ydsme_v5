import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { canViewContentManagement, isAdministrator } from "@/lib/auth";
import { PortalNavigation } from "@/app/components/PortalNavigation";

export function PortalShell({ children, role, name }: { children: ReactNode; role: AppRole; name: string }) {
  return <div className="portal-shell"><PortalNavigation role={role} name={name} canViewContent={canViewContentManagement(role)} administrator={isAdministrator(role)}/><main className="portal-main">{children}</main></div>;
}
