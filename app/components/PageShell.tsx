import type { ReactNode } from "react";
import { getPublicSiteConfig } from "@/lib/data";
import { RailSiteFrame } from "./RailSite";

type PageShellProps = {
  children: ReactNode;
  headerTheme?: "overlay" | "light";
};

export async function PageShell({ children, headerTheme = "overlay" }: PageShellProps) {
  const siteConfig = await getPublicSiteConfig();
  return <RailSiteFrame siteConfig={siteConfig} headerTheme={headerTheme}>{children}</RailSiteFrame>;
}
