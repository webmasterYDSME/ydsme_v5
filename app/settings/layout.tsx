import type { ReactNode } from "react";
import { ProtectedArea } from "@/app/components/ProtectedArea";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  // The page checks settings.manage after forwarding legacy membership links.
  return <ProtectedArea>{children}</ProtectedArea>;
}
