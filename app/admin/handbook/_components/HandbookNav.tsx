"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../handbook.module.css";

export type NavChapter = { slug: string; title: string; note: string | null };

function List({ chapters }: { chapters: NavChapter[] }) {
  const pathname = usePathname();
  return <nav className={styles.toc} aria-label="Handbook chapters">
    <p className={styles.tocTitle}>Chapters</p>
    <Link href="/admin/handbook" prefetch={false} aria-current={pathname === "/admin/handbook" ? "page" : undefined}>Contents and search</Link>
    {chapters.map((chapter) => <Link key={chapter.slug} href={`/admin/handbook/${chapter.slug}`} prefetch={false} aria-current={pathname === `/admin/handbook/${chapter.slug}` ? "page" : undefined}>
      {chapter.title}{chapter.note ? <span className={styles.tocSmall}>{chapter.note}</span> : null}
    </Link>)}
    <Link href="/admin/handbook/all" prefetch={false} aria-current={pathname === "/admin/handbook/all" ? "page" : undefined}>Whole handbook (to print)</Link>
  </nav>;
}

export function HandbookNav({ chapters }: { chapters: NavChapter[] }) {
  return <>
    <List chapters={chapters}/>
    <details className={styles.tocMobile}><summary>Chapters</summary><List chapters={chapters}/></details>
  </>;
}
