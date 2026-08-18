import type { ReactNode } from "react";
import { ProtectedArea } from "@/app/components/ProtectedArea";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ProtectedArea roles={["administrator", "committee"]}>{children}</ProtectedArea>;
}
