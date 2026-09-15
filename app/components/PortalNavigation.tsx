"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen, CalendarDays, ChevronDown, Gauge, Globe2, Hammer, HandCoins,
  History, Landmark, LogOut, Menu, Megaphone, Settings, TicketCheck, UserRound,
  UsersRound, Wrench, X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import type { AppRole } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

type PortalLink = {
  href: string;
  label: string;
  icon: ComponentType;
  activePaths?: string[];
  count?: number;
};

type PortalGroup = {
  id: string;
  label: string;
  icon: ComponentType;
  links: PortalLink[];
};

type PortalNavigationProps = {
  role: AppRole;
  name: string;
  canViewContent: boolean;
  administrator: boolean;
  membershipOfficer: boolean;
  membershipEnabled: boolean;
  membershipTaskCount: number;
};

const memberLinks: PortalLink[] = [
  { href: "/dashboard/workbench", label: "Project workbench", icon: Hammer },
  {
    href: "/dashboard/library",
    label: "Society library",
    icon: BookOpen,
    activePaths: ["/dashboard/minutes", "/dashboard/publications", "/dashboard/resources"],
  },
];

const contentLinks: PortalLink[] = [
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/bookings", label: "Visitor bookings", icon: TicketCheck },
  { href: "/admin/workshops", label: "Workshops", icon: Wrench },
];

const administratorLinks: PortalLink[] = [
  { href: "/settings", label: "Site settings", icon: Settings },
  { href: "/admin/audit", label: "Important changes", icon: History },
];

function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function linkIsCurrent(pathname: string, link: PortalLink) {
  return pathMatches(pathname, link.href) || Boolean(link.activePaths?.some((href) => pathMatches(pathname, href)));
}

const navigationStorageKey = "portal-navigation-groups";
const navigationStorageEvent = "portal-navigation-groups-change";

function subscribeToNavigationStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(navigationStorageEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(navigationStorageEvent, onStoreChange);
  };
}

function getNavigationStorageSnapshot() {
  return window.localStorage.getItem(navigationStorageKey) || "[]";
}

function getNavigationStorageServerSnapshot() {
  return "[]";
}

export function PortalNavigation(props: PortalNavigationProps) {
  const pathname = usePathname();
  return <PortalNavigationForPath key={pathname} {...props} pathname={pathname}/>;
}

function PortalNavigationForPath({
  role,
  name,
  canViewContent,
  administrator,
  membershipOfficer,
  membershipEnabled,
  membershipTaskCount,
  pathname,
}: PortalNavigationProps & { pathname: string }) {
  const groups: PortalGroup[] = [
    { id: "members", label: "For members", icon: UserRound, links: memberLinks },
    ...(canViewContent ? [{ id: "website", label: "Website", icon: Globe2, links: contentLinks }] : []),
    ...(role !== "member" ? [{
      id: "membership",
      label: "Membership and money",
      icon: Landmark,
      links: [
        ...(membershipOfficer && membershipEnabled ? [{ href: "/admin/memberships", label: "Memberships", icon: UsersRound, count: membershipTaskCount }] : []),
        { href: "/admin/members", label: administrator ? "People" : "Member register", icon: UsersRound, activePaths: ["/admin/people"] },
        ...((membershipOfficer || administrator) ? [{ href: "/admin/donations", label: "Donations", icon: HandCoins }] : []),
      ],
    }] : []),
    ...(administrator ? [{ id: "administration", label: "Administration", icon: Settings, links: administratorLinks }] : []),
  ];
  const activeGroupId = groups.find((group) => group.links.some((link) => linkIsCurrent(pathname, link)))?.id;
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroupId ?? null);
  const storedGroups = useSyncExternalStore(subscribeToNavigationStorage, getNavigationStorageSnapshot, getNavigationStorageServerSnapshot);
  let rememberedGroups: string[] = [];
  try {
    const parsed = JSON.parse(storedGroups);
    if (Array.isArray(parsed)) rememberedGroups = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    rememberedGroups = [];
  }
  const visibleGroup = expandedGroup ?? rememberedGroups[0] ?? null;
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationPanel = useRef<HTMLDivElement>(null);

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

  function toggleGroup(groupId: string) {
    const next = visibleGroup === groupId ? null : groupId;
    setExpandedGroup(next);
    try {
      window.localStorage.setItem(navigationStorageKey, JSON.stringify(next ? [next] : []));
      window.dispatchEvent(new Event(navigationStorageEvent));
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }

  return <>
    <aside className={open ? "portal-sidebar is-open" : "portal-sidebar"}>
      <div className="portal-sidebar-top">
        <Link href="/" className="portal-brand" prefetch={false} onClick={closeMenu}>
          <Image src="/ydsme-logo-detailed-gold-lions.png" alt="York Model Engineers" width={72} height={72}/>
          <span>York Model<br/><b>Engineers</b></span>
        </Link>
        <button ref={menuButton} className="portal-menu-button" type="button" aria-controls="portal-navigation" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span>{open ? "Close" : "Menu"}</span>
          {open ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}
        </button>
      </div>
      <div ref={navigationPanel} id="portal-navigation" className="portal-navigation-panel" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined} aria-label={open ? "Navigation menu" : undefined}>
        <nav aria-label="Member navigation">
          <Link href="/dashboard" prefetch={false} onClick={closeMenu} aria-current={pathname === "/dashboard" ? "page" : undefined} className={`portal-nav-overview${pathname === "/dashboard" ? " active" : ""}`}><Gauge/>Overview</Link>
          {groups.map((group) => {
            const expanded = visibleGroup === group.id;
            const current = group.id === activeGroupId;
            const taskCount = group.links.reduce((total, link) => total + (link.count ?? 0), 0);
            const GroupIcon = group.icon;
            return <section className={`portal-nav-group${current ? " has-active" : ""}`} key={group.id}>
              <button type="button" className="portal-nav-group-toggle" aria-expanded={expanded} aria-controls={`portal-nav-${group.id}`} onClick={() => toggleGroup(group.id)}>
                <GroupIcon aria-hidden="true"/>
                <span>{group.label}</span>
                {taskCount > 0 && !expanded ? <span className="portal-nav-count" aria-label={`${taskCount} ${taskCount === 1 ? "task needs" : "tasks need"} attention`}>{taskCount}</span> : null}
                <ChevronDown className="portal-nav-chevron" aria-hidden="true"/>
              </button>
              <div id={`portal-nav-${group.id}`} className={`portal-nav-group-links${expanded ? " is-expanded" : ""}`}>
                {group.links.map((link) => {
                  const linkCurrent = linkIsCurrent(pathname, link);
                  const Icon = link.icon;
                  return <Link key={link.href} href={link.href} prefetch={false} onClick={closeMenu} aria-current={linkCurrent ? "page" : undefined} className={linkCurrent ? "active" : undefined}>
                    <Icon aria-hidden="true"/>
                    <span>{link.label}</span>
                    {(link.count ?? 0) > 0 ? <span className="portal-nav-count" aria-label={`${link.count} ${link.count === 1 ? "task needs" : "tasks need"} attention`}>{link.count}</span> : null}
                  </Link>;
                })}
              </div>
            </section>;
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
