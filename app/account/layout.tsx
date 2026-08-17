import type { ReactNode } from "react";
import { ProtectedArea } from "@/app/components/ProtectedArea";

export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <ProtectedArea>{children}</ProtectedArea>;
}
