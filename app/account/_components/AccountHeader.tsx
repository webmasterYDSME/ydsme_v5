import Link from "next/link";
import type { ReactNode } from "react";
import { membershipStatus, statusTone } from "../format";
import styles from "../account.module.css";

const toneClass = { good: styles.chipGood, warn: styles.chipWarn, bad: styles.chipBad } as const;

export type AccountTabLink = { id: string; label: string; href: string; current: boolean };

/** The same heading as the dashboard (label, name, a line of detail), the notifications bell where the dashboard has its action, and the tabs. */
export function AccountHeader({ name, email, role, membershipState, tabs, bell }: {
  name: string;
  email: string;
  role: string;
  membershipState: string | null;
  tabs: AccountTabLink[];
  /** The notifications bell. Left out when the membership area is off. */
  bell: ReactNode;
}) {
  return <>
    <header className={`portal-heading ${styles.head}`}>
      <div className={styles.headText}>
        <p className="eyebrow dark">Your account</p>
        <h1>{name}</h1>
        <div className={styles.identity}>
          <span className={styles.email}>{email}</span>
          <span className={styles.chips}>
            <span className={styles.chip}>{role.replaceAll("-", " ")}</span>
            {membershipState ? <span className={`${styles.chip} ${toneClass[statusTone(membershipState)]}`}>{membershipStatus(membershipState)}</span> : null}
          </span>
        </div>
      </div>
      {bell}
    </header>
    <nav className={styles.tabs} aria-label="Account sections">
      {tabs.map((tab) => <Link key={tab.id} href={tab.href} scroll={false} aria-current={tab.current ? "page" : undefined}>{tab.label}</Link>)}
    </nav>
  </>;
}
