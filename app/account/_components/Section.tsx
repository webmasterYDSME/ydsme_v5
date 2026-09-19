import type { ReactNode } from "react";
import styles from "../account.module.css";

/** One part of the account page: what it is on the left, the content on the right. No box, just space and a rule. */
export function Section({ id, title, description, count, children }: {
  id: string;
  title: string;
  description?: string;
  /** Shown as a small badge beside the title, for example unread notifications. */
  count?: number;
  children: ReactNode;
}) {
  return <section className={styles.section} id={id} aria-labelledby={`${id}-heading`}>
    <header className={styles.sectionHead}>
      <h2 id={`${id}-heading`}>{title}{count ? <span className={styles.count} aria-label={`${count} unread`}>{count}</span> : null}</h2>
      {description ? <p>{description}</p> : null}
    </header>
    <div className={styles.sectionBody}>{children}</div>
  </section>;
}
