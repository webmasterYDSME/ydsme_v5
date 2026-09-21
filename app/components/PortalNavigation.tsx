"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, Bell, BookMarked, BookOpen, CalendarDays, ChevronsUpDown, Hammer, HandHeart, History, IdCard, KeyRound,
  LayoutDashboard, LogOut, Mail, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings,
  TicketCheck, UserRound, Wrench, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalSearch } from "@/app/components/PortalSearch";
import { openNotificationsEvent } from "@/app/components/portal-events";
import {
  accountLink, attentionCount, initials, itemIsCurrent, navItems, portalSidebarCollapsed,
  portalSidebarCookie, portalSidebarExpanded, type PortalIcon, type PortalNavItem, type PortalNavSection,
} from "@/lib/portal-nav";
import styles from "./portal-navigation.module.css";

const icons: Record<PortalIcon, LucideIcon> = {
  overview: LayoutDashboard,
  workbench: Hammer,
  library: BookOpen,
  memberships: IdCard,
  accounts: KeyRound,
  donations: HandHeart,
  announcements: Megaphone,
  events: CalendarDays,
  bookings: TicketCheck,
  workshops: Wrench,
  settings: Settings,
  audit: History,
  email: Mail,
  handbook: BookMarked,
  switch: ArrowLeftRight,
};

type PortalNavigationProps = {
  sections: PortalNavSection[];
  name: string;
  roleLabel: string;
  initialCollapsed: boolean;
  canSearchMembers: boolean;
  /** The notifications list, drawn on the server. Null when the membership area is off, and the bell is left out. */
  notificationPanel: ReactNode | null;
  unreadNotifications: number;
};

const unreadText = (count: number) => (count ? `Notifications, ${count} unread` : "Notifications");
const taskText = (count: number) => `${count} ${count === 1 ? "task needs" : "tasks need"} attention`;
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function PortalNavigation({ sections, name, roleLabel, initialCollapsed, canSearchMembers, notificationPanel, unreadNotifications }: PortalNavigationProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Each panel remembers the page it was opened on, so it closes by itself when the page changes.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [accountPath, setAccountPath] = useState<string | null>(null);
  const [searchPath, setSearchPath] = useState<string | null>(null);
  const [notificationsPath, setNotificationsPath] = useState<string | null>(null);
  const notificationsOpen = notificationsPath === pathname;
  const menuOpen = menuPath === pathname;
  const accountOpen = accountPath === pathname;
  const searchOpen = searchPath === pathname;

  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const accountArea = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const notificationsArea = useRef<HTMLDivElement>(null);

  const items = navItems(sections);
  const attention = attentionCount(sections);

  // Ctrl+K or Cmd+K opens search from anywhere in the portal.
  useEffect(() => {
    function openWithShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuPath(null);
        setAccountPath(null);
        setNotificationsPath(null);
        setSearchPath(pathname);
      }
    }
    window.addEventListener("keydown", openWithShortcut);
    return () => window.removeEventListener("keydown", openWithShortcut);
  }, [pathname]);

  // The phone drawer: lock page scroll, keep Tab inside it, close on Escape or when the screen becomes wide.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a")?.focus();

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuPath(null);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("a, button:not(:disabled)") ?? [])
        .filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    const tabletUp = window.matchMedia("(min-width: 1025px)");
    function closeAtDesktopWidth(event: MediaQueryListEvent) {
      if (event.matches) setMenuPath(null);
    }
    window.addEventListener("keydown", handleKeyboard);
    tabletUp.addEventListener("change", closeAtDesktopWidth);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyboard);
      tabletUp.removeEventListener("change", closeAtDesktopWidth);
    };
  }, [menuOpen]);

  // The account menu closes when you press Escape or click anywhere outside it.
  useEffect(() => {
    if (!accountOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!accountArea.current?.contains(event.target as Node)) setAccountPath(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountPath(null);
        accountButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  // Anything on a page can ask for the notifications to open (the dashboard has a button for it).
  useEffect(() => {
    if (!notificationPanel) return;
    function open() {
      setMenuPath(null);
      setAccountPath(null);
      setNotificationsPath(pathname);
    }
    window.addEventListener(openNotificationsEvent, open);
    return () => window.removeEventListener(openNotificationsEvent, open);
  }, [pathname, notificationPanel]);

  // The notifications panel closes on Escape or a click outside it (the bell buttons handle their own clicks).
  useEffect(() => {
    if (!notificationsOpen) return;
    function closeOutside(event: PointerEvent) {
      const target = event.target as Element | null;
      if (notificationsArea.current?.contains(target) || target?.closest("[data-notifications-trigger]")) return;
      setNotificationsPath(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setNotificationsPath(null);
      document.querySelector<HTMLElement>("[data-notifications-trigger]:not([hidden])")?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  function toggleNotifications() {
    setMenuPath(null);
    setAccountPath(null);
    setNotificationsPath(notificationsOpen ? null : pathname);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setAccountPath(null);
    setNotificationsPath(null);
    try {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${portalSidebarCookie}=${next ? portalSidebarCollapsed : portalSidebarExpanded}; path=/; max-age=31536000; samesite=lax${secure}`;
    } catch {
      // The sidebar still works when cookies are blocked; the choice just is not remembered.
    }
  }

  function openSearch() {
    setMenuPath(null);
    setAccountPath(null);
    setNotificationsPath(null);
    setSearchPath(pathname);
  }

  function renderLink(item: PortalNavItem) {
    const current = itemIsCurrent(pathname, item);
    const Icon = icons[item.icon];
    return <Link key={item.key} href={item.href} prefetch={false} data-tip={item.label} aria-current={current ? "page" : undefined} className={cx(styles.link, current && styles.linkOn)}>
      <Icon aria-hidden="true"/>
      <span className={styles.label}>{item.label}</span>
      {(item.count ?? 0) > 0 ? <span className={styles.count}><span className={styles.srOnly}>{taskText(item.count!)}</span><span aria-hidden="true">{item.count}</span></span> : null}
    </Link>;
  }

  const signOutForm = <form action={signOut}>
    <PendingSubmitButton className={styles.popItem} pendingLabel="Signing out…"><LogOut aria-hidden="true"/>Sign out</PendingSubmitButton>
  </form>;

  return <>
    <aside className={cx(styles.sidebar, collapsed && styles.rail, menuOpen && styles.open)} aria-label="Portal sidebar">
      <button type="button" className={cx(styles.scrim, menuOpen && styles.scrimOn)} aria-label="Close navigation" tabIndex={-1} onClick={() => { setMenuPath(null); menuButton.current?.focus(); }}/>
      <div className={styles.top}>
        <Link href="/" className={styles.brand} prefetch={false}>
          <Image src="/ydsme-logo-detailed-gold-lions.png" alt="York Model Engineers" width={72} height={72}/>
          <span className={styles.brandText}>York Model<br/><b>Engineers</b></span>
        </Link>
        <button type="button" className={styles.collapseButton} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="portal-navigation" onClick={toggleCollapsed}>
          {collapsed ? <PanelLeftOpen aria-hidden="true"/> : <PanelLeftClose aria-hidden="true"/>}
        </button>
        <div className={styles.topActions}>
          <button type="button" className={styles.iconButton} aria-label="Search" onClick={openSearch}><Search aria-hidden="true"/></button>
          {notificationPanel ? <button type="button" data-notifications-trigger className={cx(styles.iconButton, styles.bellTop)} aria-label={unreadText(unreadNotifications)} aria-expanded={notificationsOpen} aria-controls="portal-notifications" onClick={toggleNotifications}>
            <Bell aria-hidden="true"/>
            {unreadNotifications > 0 ? <span className={styles.bellBadge} aria-hidden="true">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}
          </button> : null}
          <button ref={menuButton} type="button" className={styles.menuButton} aria-controls="portal-navigation" aria-expanded={menuOpen} onClick={() => setMenuPath(menuOpen ? null : pathname)}>
            <Menu aria-hidden="true"/>Menu
            {attention > 0 ? <span className={styles.menuBadge}><span className={styles.srOnly}>{taskText(attention)}</span><span aria-hidden="true">{attention}</span></span> : null}
          </button>
        </div>
      </div>

      <div ref={panel} id="portal-navigation" className={styles.panel} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? "true" : undefined} aria-label={menuOpen ? "Navigation menu" : undefined}>
        <div className={styles.drawerHead}>
          <span>Menu</span>
          <button type="button" className={styles.iconButton} aria-label="Close menu" onClick={() => { setMenuPath(null); menuButton.current?.focus(); }}><X aria-hidden="true"/></button>
        </div>
        <button type="button" className={cx(styles.search, styles.desktopOnly)} data-tip="Search" aria-keyshortcuts="Control+K Meta+K" onClick={openSearch}>
          <Search aria-hidden="true"/>
          <span className={styles.label}>{canSearchMembers ? "Search pages and members" : "Search pages"}</span>
        </button>
        <nav className={styles.nav} aria-label="Main">
          {sections.map((section) => section.label === null
            ? section.items.map(renderLink)
            : <div key={section.id} className={styles.section} role="group" aria-labelledby={`portal-nav-${section.id}`}>
              <p id={`portal-nav-${section.id}`} className={styles.sectionLabel}>{section.label}</p>
              {section.items.map(renderLink)}
            </div>)}
        </nav>

        {notificationPanel ? <div className={cx(styles.bellWrap, styles.desktopOnly)}><button type="button" data-notifications-trigger className={cx(styles.link, styles.bellRow, notificationsOpen && styles.linkOn)} data-tip="Notifications" aria-label={unreadText(unreadNotifications)} aria-expanded={notificationsOpen} aria-controls="portal-notifications" onClick={toggleNotifications}>
          <Bell aria-hidden="true"/>
          <span className={styles.label}>Notifications</span>
          {unreadNotifications > 0 ? <span className={styles.count} aria-hidden="true">{unreadNotifications}</span> : null}
        </button></div> : null}

        <div ref={accountArea} className={styles.footer}>
          <div className={styles.desktopAccount}>
            {accountOpen ? <div id="portal-account-menu" className={styles.pop}>
              <Link href={accountLink.href} prefetch={false} className={styles.popItem} aria-current={pathname === accountLink.href ? "page" : undefined}><UserRound aria-hidden="true"/>{accountLink.label}</Link>
              {signOutForm}
            </div> : null}
            <button ref={accountButton} type="button" className={styles.accountButton} aria-expanded={accountOpen} aria-controls={accountOpen ? "portal-account-menu" : undefined} aria-label={`Account menu for ${name}`} onClick={() => setAccountPath(accountOpen ? null : pathname)}>
              <span className={styles.avatar} aria-hidden="true">{initials(name)}</span>
              <span className={styles.accountText}><strong>{name}</strong><small>{roleLabel}</small></span>
              <ChevronsUpDown className={styles.accountChevron} aria-hidden="true"/>
            </button>
          </div>
          <div className={styles.mobileAccount}>
            <div className={styles.accountRow}>
              <span className={styles.avatar} aria-hidden="true">{initials(name)}</span>
              <span className={styles.accountText}><strong>{name}</strong><small>{roleLabel}</small></span>
            </div>
            <Link href={accountLink.href} prefetch={false} className={styles.popItem} aria-current={pathname === accountLink.href ? "page" : undefined}><UserRound aria-hidden="true"/>{accountLink.label}</Link>
            {signOutForm}
          </div>
        </div>
      </div>
    </aside>
    {notificationPanel ? <div id="portal-notifications" ref={notificationsArea} className={cx(styles.notifyPanel, collapsed && styles.notifyPanelRail)} role="region" aria-label="Notifications" hidden={!notificationsOpen}>{notificationPanel}</div> : null}
    {searchOpen ? <PortalSearch items={items} canSearchMembers={canSearchMembers} onClose={() => setSearchPath(null)}/> : null}
  </>;
}
