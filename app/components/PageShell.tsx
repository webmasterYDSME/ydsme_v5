import type { ReactNode } from "react";
import { getPublicSiteConfig } from "@/lib/data";
import { RailSiteFrame } from "./RailSite";

export async function PageShell({ children }: { children: ReactNode }) {
  const siteConfig = await getPublicSiteConfig();
  return <RailSiteFrame siteConfig={siteConfig}>{children}</RailSiteFrame>;
}
