import type { ComponentType, ReactNode } from "react";
import styles from "../account.module.css";

/** One card on the account page, built from the same parts as the dashboard cards: a small label, a display heading and a rule. */
export function Section({ id, eyebrow, title, description, icon: Icon, accent, children }: {
  id: string;
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: string;
  description?: string;
  /** A quiet line icon at the right of the heading. */
  icon?: ComponentType<{ "aria-hidden"?: boolean }>;
  /** The coloured top edge that marks the main card, as on the dashboard. */
  accent?: "rust" | "brass";
  children: ReactNode;
}) {
  const accentClass = accent === "rust" ? "dashboard-primary-card" : accent === "brass" ? "dashboard-latest-card" : "";
  return <section className={`portal-card ${accentClass} ${styles.card}`} id={id} aria-labelledby={`${id}-heading`}>
    <header className="card-heading">
      <div>
        <p className="eyebrow dark">{eyebrow}</p>
        <h2 id={`${id}-heading`}>{title}</h2>
        {description ? <p className={styles.cardIntro}>{description}</p> : null}
      </div>
      {Icon ? <span className={styles.cardIcon}><Icon aria-hidden/></span> : null}
    </header>
    <div className={styles.cardBody}>{children}</div>
  </section>;
}
