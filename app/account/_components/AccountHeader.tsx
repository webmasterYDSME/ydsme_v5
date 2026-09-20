import Link from "next/link";
import { initials, membershipStatus, statusTone } from "../format";
import styles from "../account.module.css";

const toneClass = { good: styles.chipGood, warn: styles.chipWarn, bad: styles.chipBad } as const;

export type AccountTabLink = { id: string; label: string; href: string; current: boolean; /** Shown as a small badge, for example unread notifications. */ count?: number };

/** Who is signed in, their role and membership state, and the tabs that split the page into a few calm parts. */
export function AccountBanner({ name, email, role, membershipState, tabs }: {
  name: string;
  email: string;
  role: string;
  membershipState: string | null;
  tabs: AccountTabLink[];
}) {
  return <>
    <header className={styles.head}>
      <div className={styles.avatar} aria-hidden="true">{initials(name)}</div>
      <div className={styles.headText}>
        <h1>{name}</h1>
        <p className={styles.email}>{email}</p>
      </div>
      <div className={styles.chips}>
        <span className={styles.chip}>{role.replaceAll("-", " ")}</span>
        {membershipState ? <span className={`${styles.chip} ${toneClass[statusTone(membershipState)]}`}>{membershipStatus(membershipState)}</span> : null}
      </div>
    </header>
    <nav className={styles.tabs} aria-label="Account sections">
      {tabs.map((tab) => <Link key={tab.id} href={tab.href} scroll={false} aria-current={tab.current ? "page" : undefined}>
        {tab.label}
        {tab.count ? <span className={styles.tabCount} aria-label={`${tab.count} unread`}>{tab.count}</span> : null}
      </Link>)}
    </nav>
  </>;
}
