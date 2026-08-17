import type { ReactNode } from "react";
import { ProtectedArea } from "@/app/components/ProtectedArea";

export const dynamic = "force-dynamic";

export default function AdministratorLayout({ children }: { children: ReactNode }) {
  return <ProtectedArea roles={["administrator"]}>{children}</ProtectedArea>;
}
