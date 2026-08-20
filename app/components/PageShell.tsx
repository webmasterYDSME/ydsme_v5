import type { ReactNode } from "react";
import { getPublicSiteConfig } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { RailSiteFrame } from "./RailSite";

type PageShellProps = {
  children: ReactNode;
  headerTheme?: "overlay" | "light";
};

export async function PageShell({ children, headerTheme = "overlay" }: PageShellProps) {
  const [siteConfig, user] = await Promise.all([getPublicSiteConfig(), getCurrentUser()]);
  return <RailSiteFrame siteConfig={siteConfig} headerTheme={headerTheme} isAuthenticated={Boolean(user)}>{children}</RailSiteFrame>;
}
