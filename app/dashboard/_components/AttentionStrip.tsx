import Link from "next/link";
import { CircleCheck, Inbox } from "lucide-react";
import type { AttentionSummary } from "../attention";
import styles from "../dashboard.module.css";

/** For membership officers: what is waiting in the membership Inbox, by kind, each linking straight to that list. */
export function AttentionStrip({ summary }: { summary: AttentionSummary }) {
  if (!summary.total) {
    return <section className={`${styles.attention} ${styles.attentionClear}`} aria-label="Membership tasks">
      <CircleCheck aria-hidden="true"/>
      <p><strong>The membership Inbox is clear.</strong> Nothing is waiting for you.</p>
      <Link href="/admin/memberships" prefetch={false}>Open Inbox</Link>
    </section>;
  }
  return <section className={styles.attention} aria-labelledby="needs-attention">
    <div className={styles.attentionHead}>
      <Inbox aria-hidden="true"/>
      <div>
        <p className={styles.tileLabel}>Membership Inbox</p>
        <h2 id="needs-attention">Needs your attention</h2>
      </div>
      <Link className={styles.attentionAll} href="/admin/memberships" prefetch={false}>Open Inbox</Link>
    </div>
    <ul className={styles.attentionList}>
      {summary.items.map((item) => <li key={item.key}>
        <Link href={item.href} prefetch={false}><strong>{item.count}</strong><span>{item.label}</span></Link>
      </li>)}
    </ul>
  </section>;
}
