"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const base = "/admin/memberships";

export function MembershipNav({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Inbox", count: inboxCount, current: pathname === base },
    { href: `${base}/members`, label: "Members", current: pathname.startsWith(`${base}/members`) },
    { href: `${base}/renewals`, label: "Renewals", current: pathname.startsWith(`${base}/renewals`) },
    { href: `${base}/setup`, label: "Setup", current: pathname.startsWith(`${base}/setup`) },
  ];
  return <nav className="portal-tabs" aria-label="Membership workspace">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} prefetch={false} aria-current={tab.current ? "page" : undefined}>
      {tab.label}{typeof tab.count === "number" ? <span>{tab.count}</span> : null}
    </Link>)}
  </nav>;
}
