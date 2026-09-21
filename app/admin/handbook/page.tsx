import Link from "next/link";
import { membershipMode } from "@/lib/features";
import { handbookChapters } from "@/lib/handbook";
import { audienceLabels, chapterHref, searchHandbook } from "@/lib/handbook/text";
import styles from "./handbook.module.css";

export const dynamic = "force-dynamic";

const quickLinks: { label: string; slug: string; section?: string }[] = [
  { label: "Record a cash, cheque or bank payment", slug: "payments", section: "recording" },
  { label: "Send renewal invitations", slug: "renewals", section: "opening" },
  { label: "Send a reminder", slug: "renewals", section: "reminders" },
  { label: "Bring back a lapsed member", slug: "renewals", section: "lapsed" },
  { label: "Change a fee", slug: "types-and-fees", section: "changing-a-fee" },
  { label: "Import the MemberMojo list", slug: "membermojo-import", section: "steps" },
  { label: "Add a new member", slug: "members", section: "adding" },
  { label: "What each status means", slug: "membership-year", section: "states" },
];

export default async function HandbookHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const raw = Array.isArray(query.q) ? query.q[0] : query.q;
  const q = (raw ?? "").trim().slice(0, 100);
  const websiteMode = (await membershipMode()) === "website";

  if (q) {
    const hits = searchHandbook(handbookChapters, q);
    return <section className={styles.card} aria-labelledby="results-title">
      <h2 id="results-title" className={styles.h2}>{hits.length ? `${hits.length} ${hits.length === 1 ? "place" : "places"} mention “${q}”` : `Nothing found for “${q}”`}</h2>
      {hits.length ? <div className={styles.results} style={{ marginTop: 16 }}>
        {hits.map((hit) => <Link key={`${hit.chapterSlug}#${hit.sectionId}`} className={styles.result} href={chapterHref(hit.chapterSlug, hit.sectionId)} prefetch={false}>
          <small>{hit.chapterTitle}</small>
          <strong>{hit.sectionTitle}</strong>
          <p>{hit.snippet}</p>
        </Link>)}
      </div> : <div className={styles.prose} style={{ marginTop: 12 }}>
        <p>Try one word, such as a status (“lapsed”), a job (“reminder”) or a screen (“Inbox”). The chapter list on this page shows everything the handbook covers.</p>
      </div>}
      <p style={{ marginTop: 18 }}><Link href="/admin/handbook" prefetch={false}>← Back to the contents</Link></p>
    </section>;
  }

  return <div style={{ display: "grid", gap: 26 }}>
    <section className={styles.card} aria-labelledby="quick-title">
      <h2 id="quick-title" className={styles.h2}>Find it fast</h2>
      <ul className={styles.quick}>
        {quickLinks.map((link) => <li key={link.label}><Link href={chapterHref(link.slug, link.section)} prefetch={false}>{link.label}</Link></li>)}
      </ul>
    </section>
    <section aria-labelledby="chapters-title">
      <h2 id="chapters-title" className={styles.h2} style={{ marginBottom: 14 }}>The chapters</h2>
      <div className={styles.chapterGrid}>
        {handbookChapters.map((chapter) => <Link key={chapter.slug} className={styles.chapterCard} href={chapterHref(chapter.slug)} prefetch={false}>
          <strong>{chapter.title}</strong>
          <p>{chapter.summary}</p>
          <ul className={styles.meta}>
            <li className={`${styles.pill} ${chapter.audience === "administrator" ? styles.pillAdmin : ""}`}>{audienceLabels[chapter.audience]}</li>
            {chapter.websiteMode ? <li className={`${styles.pill} ${styles.pillWebsite}`}>{websiteMode ? "Website mode" : "Website mode · off for now"}</li> : null}
          </ul>
        </Link>)}
      </div>
    </section>
  </div>;
}
