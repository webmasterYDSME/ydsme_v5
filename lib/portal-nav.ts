// The dashboard sidebar's contents, decided from who is signed in.
// No imports, so it can be unit tested with `node --experimental-strip-types`.

export type PortalRole = "member" | "committee" | "administrator";

export type PortalIcon =
  | "overview" | "workbench" | "library" | "memberships" | "accounts" | "donations"
  | "announcements" | "events" | "bookings" | "workshops" | "settings" | "audit" | "email" | "handbook";

export type PortalNavItem = {
  key: string;
  href: string;
  label: string;
  icon: PortalIcon;
  /** Other paths that belong to this item, so it stays highlighted on them. */
  activePaths?: string[];
  /** Only the exact address counts as current (for pages that other items live beneath). */
  exact?: boolean;
  /** Tasks waiting for this person; shown as a badge. */
  count?: number;
};

export type PortalNavSection = {
  id: string;
  /** Null for the Overview link, which stands alone above the groups. */
  label: string | null;
  items: PortalNavItem[];
};

export type PortalNavInput = {
  role: PortalRole;
  canViewContent: boolean;
  administrator: boolean;
  membershipOfficer: boolean;
  membershipEnabled: boolean;
  membershipTaskCount: number;
};

export const accountLink = { href: "/account", label: "Account" } as const;

const overview: PortalNavItem = { key: "overview", href: "/dashboard", label: "Overview", icon: "overview", exact: true };

const membersArea: PortalNavItem[] = [
  { key: "workbench", href: "/dashboard/workbench", label: "Project workbench", icon: "workbench" },
  { key: "library", href: "/dashboard/library", label: "Society library", icon: "library", activePaths: ["/dashboard/minutes", "/dashboard/publications", "/dashboard/resources"] },
];

const website: PortalNavItem[] = [
  { key: "announcements", href: "/admin/announcements", label: "Announcements", icon: "announcements" },
  { key: "events", href: "/admin/events", label: "Events", icon: "events" },
  { key: "bookings", href: "/admin/bookings", label: "Visitor bookings", icon: "bookings" },
  { key: "workshops", href: "/admin/workshops", label: "Workshops", icon: "workshops" },
];

const administration: PortalNavItem[] = [
  { key: "settings", href: "/settings", label: "Site settings", icon: "settings" },
  { key: "email-queue", href: "/administrator/email-queue", label: "Email queue", icon: "email" },
  { key: "audit", href: "/admin/audit", label: "Important changes", icon: "audit" },
];

/**
 * Groups follow the job, not the role: the day-to-day membership and website work comes first for
 * anyone who has it, and the members' own area (which everyone has) comes after.
 */
export function buildPortalNav(input: PortalNavInput): PortalNavSection[] {
  const sections: PortalNavSection[] = [{ id: "overview", label: null, items: [overview] }];

  if (input.role !== "member") {
    const items: PortalNavItem[] = [];
    if (input.membershipOfficer && input.membershipEnabled) {
      items.push({ key: "memberships", href: "/admin/memberships", label: "Memberships", icon: "memberships", count: input.membershipTaskCount });
    }
    items.push({ key: "accounts", href: "/admin/members", label: "Website accounts", icon: "accounts", activePaths: ["/admin/people"] });
    if (input.membershipOfficer || input.administrator) {
      items.push({ key: "donations", href: "/admin/donations", label: "Donations", icon: "donations" });
    }
    // The handbook is for whoever looks after the register, whichever system currently runs membership.
    if (input.membershipOfficer) items.push({ key: "handbook", href: "/admin/handbook", label: "Officer handbook", icon: "handbook" });
    sections.push({ id: "membership", label: "Membership and money", items });
  }

  if (input.canViewContent) sections.push({ id: "website", label: "Website", items: website });
  sections.push({ id: "members", label: "Members’ area", items: membersArea });
  if (input.administrator) sections.push({ id: "administration", label: "Administration", items: administration });
  return sections;
}

export function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function itemIsCurrent(pathname: string, item: Pick<PortalNavItem, "href" | "activePaths" | "exact">) {
  if (item.exact) return pathname === item.href;
  return pathMatches(pathname, item.href) || Boolean(item.activePaths?.some((href) => pathMatches(pathname, href)));
}

export function navItems(sections: PortalNavSection[]) {
  return sections.flatMap((section) => section.items);
}

/** Tasks waiting anywhere in the sidebar, for the badge on the phone Menu button. */
export function attentionCount(sections: PortalNavSection[]) {
  return navItems(sections).reduce((total, item) => total + (item.count ?? 0), 0);
}

/** "Committee member" is promoted to "Membership officer" when that responsibility has been granted. */
export function roleLabel(role: PortalRole, membershipOfficer: boolean) {
  if (role === "administrator") return "Administrator";
  if (role === "committee") return membershipOfficer ? "Membership officer" : "Committee member";
  return "Member";
}

/** Pages whose name contains every word typed. With nothing typed, the first few pages are suggested. */
export function searchPages(items: PortalNavItem[], query: string, suggestions = 5) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, suggestions);
  return items.filter((item) => words.every((word) => item.label.toLowerCase().includes(word)));
}

/** The cookie that remembers whether the sidebar is collapsed to icons, so the first paint is already right. */
export const portalSidebarCookie = "portal-sidebar";
export const portalSidebarCollapsed = "rail";
export const portalSidebarExpanded = "wide";

/** Up to two initials for the avatar; an email address gives its first letter. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
