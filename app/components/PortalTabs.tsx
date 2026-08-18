import Link from "next/link";

type PortalTab = {
  href: string;
  label: string;
  count?: number;
  current?: boolean;
};

export function PortalTabs({ label, tabs }: { label: string; tabs: PortalTab[] }) {
  return (
    <nav className="portal-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={tab.current ? "page" : undefined}>
          {tab.label}
          {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
