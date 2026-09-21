import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { PersonalTile } from "../personal";
import styles from "../dashboard.module.css";

export type StripTile = {
  key: string;
  label: string;
  tile: PersonalTile;
  /** Opens in a new tab (for a link to another site). */
  external?: boolean;
};

const toneClass = { good: styles.toneGood, warn: styles.toneWarn, bad: styles.toneBad, quiet: styles.toneQuiet } as const;

function Action({ item }: { item: StripTile }): ReactNode {
  const { action } = item.tile;
  if (!action) return null;
  if (item.external) return <a className={styles.tileAction} href={action.href} target="_blank" rel="noreferrer">{action.label}<ArrowUpRight aria-hidden="true"/></a>;
  return <Link className={styles.tileAction} href={action.href} prefetch={false}>{action.label}</Link>;
}

/** Four short tiles about the signed-in member: where their membership stands, when the next running day is, and what they have on. */
export function PersonalStrip({ tiles }: { tiles: StripTile[] }) {
  return <section className={styles.strip} aria-label="About you">
    {tiles.map((item) => <article key={item.key} className={`${styles.tile} ${toneClass[item.tile.tone]}`}>
      <p className={styles.tileLabel}>{item.label}</p>
      <h2 className={styles.tileHeadline}>{item.tile.headline}</h2>
      <p className={styles.tileDetail}>{item.tile.detail}</p>
      <Action item={item}/>
    </article>)}
  </section>;
}
