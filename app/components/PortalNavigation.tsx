"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Gauge, Hammer, HandCoins, History, LogOut, Menu, Megaphone, Settings, TicketCheck, UserRound, UsersRound, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { AppRole } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

type PortalLink = {
  href: string;
  label: string;
  icon: ComponentType;
};

const memberLinks: PortalLink[] = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/dashboard/workbench", label: "Project Workbench", icon: Hammer },
  { href: "/dashboard/minutes", label: "Minutes", icon: FileText },
  { href: "/dashboard/publications", label: "Publications", icon: FileText },
  { href: "/dashboard/resources", label: "Resources", icon: FileText },
];

const contentLinks: PortalLink[] = [
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/events", label: "Manage events", icon: CalendarDays },
  { href: "/admin/bookings", label: "Visitor bookings", icon: TicketCheck },
  { href: "/admin/workshops", label: "Workshops", icon: Wrench },
];

const administratorLinks: PortalLink[] = [
  { href: "/admin/members", label: "Members", icon: UsersRound },
  { href: "/admin/donations", label: "Donations", icon: HandCoins },
  { href: "/admin/audit", label: "Audit history", icon: History },
  { href: "/settings", label: "Committee & site", icon: Settings },
];

export function PortalNavigation({ role, name, canViewContent, administrator, membershipOfficer }: { role: AppRole; name: string; canViewContent: boolean; administrator: boolean; membershipOfficer: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationPanel = useRef<HTMLDivElement>(null);
  const links = [
    ...memberLinks,
    ...(canViewContent ? contentLinks : []),
    ...(membershipOfficer ? [{ href: "/admin/memberships", label: "Memberships", icon: UsersRound }] : []),
    ...(administrator ? administratorLinks : []),
  ];

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigationPanel.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    function handleMenuKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;
      const panelControls = navigationPanel.current?.querySelectorAll<HTMLElement>("a, button:not(:disabled)");
      const focusable = [menuButton.current, ...Array.from(panelControls ?? [])].filter((control): control is HTMLElement => control !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    const mobileNavigation = window.matchMedia("(max-width: 1024px)");
    function closeAtDesktopWidth(event: MediaQueryListEvent) {
      if (!event.matches) setOpen(false);
    }

    window.addEventListener("keydown", handleMenuKeyboard);
    mobileNavigation.addEventListener("change", closeAtDesktopWidth);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleMenuKeyboard);
      mobileNavigation.removeEventListener("change", closeAtDesktopWidth);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  function closeMenuAndRestoreFocus() {
    setOpen(false);
    menuButton.current?.focus();
  }

  return <>
    <aside className={open ? "portal-sidebar is-open" : "portal-sidebar"}>
      <div className="portal-sidebar-top">
        <Link href="/" className="portal-brand" prefetch={false} onClick={closeMenu}>
          <Image src="/ydsme-logo.png" alt="York Model Engineers" width={72} height={72}/>
          <span>York Model<br/><b>Engineers</b></span>
        </Link>
        <button ref={menuButton} className="portal-menu-button" type="button" aria-controls="portal-navigation" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span>{open ? "Close" : "Menu"}</span>
          {open ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}
        </button>
      </div>
      <div ref={navigationPanel} id="portal-navigation" className="portal-navigation-panel" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined} aria-label={open ? "Navigation menu" : undefined}>
        <nav aria-label="Member navigation">
          {links.map(({ href, label, icon: Icon }) => {
            const current = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} prefetch={false} onClick={closeMenu} aria-current={current ? "page" : undefined} className={current ? "active" : undefined}><Icon/>{label}</Link>;
          })}
        </nav>
        <div className="portal-account">
          <span className="role-chip">{role}</span>
          <strong>{name}</strong>
          <Link href="/account" prefetch={false} onClick={closeMenu} aria-current={pathname === "/account" ? "page" : undefined} className={pathname === "/account" ? "active" : undefined}><UserRound/>Account</Link>
          <form action={signOut}><PendingSubmitButton pendingLabel="Signing out…"><LogOut/>Sign out</PendingSubmitButton></form>
        </div>
      </div>
    </aside>
    <button className={open ? "portal-nav-scrim is-visible" : "portal-nav-scrim"} type="button" aria-label="Close navigation" tabIndex={-1} onClick={closeMenuAndRestoreFocus}/>
  </>;
}
