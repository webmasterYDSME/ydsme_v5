import { membershipMode } from "@/lib/features";
import { handbookChapters } from "@/lib/handbook";
import { audienceLabels } from "@/lib/handbook/text";
import { HandbookSections } from "../_components/HandbookContent";
import { PrintButton } from "../_components/PrintButton";
import styles from "../handbook.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "The whole handbook · Membership officer handbook" };

export default function WholeHandbook() {
  const websiteMode = membershipMode() === "website";
  return <div style={{ display: "grid", gap: 26 }}>
    <section className={`${styles.card} ${styles.noPrint}`}>
      <h2 className={styles.h2}>The whole handbook</h2>
      <div className={styles.prose}><p>Every chapter on one page, so you can print it or save it as a PDF. It is checked against the screens on the dates shown, so print it again after a change rather than keeping an old copy.</p></div>
      <div className={styles.actions}><PrintButton label="Print the whole handbook"/></div>
    </section>
    {handbookChapters.map((chapter) => <article key={chapter.slug} className={`${styles.card} ${styles.allChapter}`} aria-labelledby={`${chapter.slug}-title`}>
      <header className={styles.chapterHead}>
        <h2 id={`${chapter.slug}-title`}>{chapter.title}</h2>
        <p>{chapter.summary}</p>
        <ul className={styles.meta}>
          <li className={styles.pill}>{audienceLabels[chapter.audience]}</li>
          {chapter.websiteMode ? <li className={`${styles.pill} ${styles.pillWebsite}`}>{websiteMode ? "Website mode" : "Website mode · off for now"}</li> : null}
          <li className={styles.pill}>Checked {chapter.reviewed}</li>
        </ul>
      </header>
      <HandbookSections chapterSlug={chapter.slug} sections={chapter.sections}/>
    </article>)}
  </div>;
}
