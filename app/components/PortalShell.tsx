import Image from "next/image";
import Link from "next/link";
import { CalendarDays, FileText, Gauge, LogOut, Settings, TicketCheck, UserRound, UsersRound, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { canViewContentManagement, isAdministrator } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export function PortalShell({ children, role, name }: { children: ReactNode; role: AppRole; name: string }) {
  return <div className="portal-shell"><aside className="portal-sidebar"><Link href="/" className="portal-brand"><Image src="/ydsme-logo.png" alt="York Model Engineers" width={72} height={72}/><span>York Model<br/><b>Engineers</b></span></Link><nav><Link href="/dashboard"><Gauge/>Overview</Link><Link href="/dashboard/minutes"><FileText/>Minutes</Link><Link href="/dashboard/publications"><FileText/>Publications</Link><Link href="/dashboard/resources"><FileText/>Resources</Link>{canViewContentManagement(role) ? <><Link href="/admin/events"><CalendarDays/>Manage events</Link><Link href="/admin/bookings"><TicketCheck/>Visitor bookings</Link><Link href="/admin/workshops"><Wrench/>Workshops</Link></> : null}{isAdministrator(role) ? <><Link href="/admin/members"><UsersRound/>Members</Link><Link href="/settings"><Settings/>Committee & site</Link></> : null}</nav><div className="portal-account"><span className="role-chip">{role.replaceAll("-", " ")}</span><strong>{name}</strong><Link href="/account"><UserRound/>Account</Link><form action={signOut}><button type="submit"><LogOut/>Sign out</button></form></div></aside><main className="portal-main">{children}</main></div>;
}
