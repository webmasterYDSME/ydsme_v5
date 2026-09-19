import { initials, membershipStatus, statusTone } from "../format";
import styles from "../account.module.css";

const toneClass = { good: styles.chipGood, warn: styles.chipWarn, bad: styles.chipBad } as const;

export type AccountNavItem = { id: string; label: string };

/** Who is signed in, their role and membership state, and links to each section of the page. */
export function AccountBanner({ name, email, role, membershipState, nav }: {
  name: string;
  email: string;
  role: string;
  membershipState: string | null;
  nav: AccountNavItem[];
}) {
  return <>
    <header className={styles.banner}>
      <div className={styles.avatar} aria-hidden="true">{initials(name)}</div>
      <div className={styles.bannerText}>
        <p className={styles.eyebrowLine}>Your account</p>
        <h1>{name}</h1>
        <p className={styles.email}>{email}</p>
      </div>
      <div className={styles.chips}>
        <span className={styles.chip}>{role.replaceAll("-", " ")}</span>
        {membershipState ? <span className={`${styles.chip} ${toneClass[statusTone(membershipState)]}`}>{membershipStatus(membershipState)}</span> : null}
      </div>
    </header>
    <nav className={styles.jump} aria-label="Sections on this page">
      {nav.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
    </nav>
  </>;
}
