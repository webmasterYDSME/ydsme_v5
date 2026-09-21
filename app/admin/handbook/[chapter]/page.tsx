import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { membershipMode } from "@/lib/features";
import { findChapter, handbookChapters } from "@/lib/handbook";
import { audienceLabels, chapterHref } from "@/lib/handbook/text";
import { HandbookSections } from "../_components/HandbookContent";
import { PrintButton } from "../_components/PrintButton";
import styles from "../handbook.module.css";

export const dynamic = "force-dynamic";

const reviewedLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }) {
  const chapter = findChapter((await params).chapter);
  return { title: chapter ? `${chapter.title} · Membership officer handbook` : "Membership officer handbook" };
}

export default async function HandbookChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: slug } = await params;
  const chapter = findChapter(slug);
  if (!chapter) notFound();
  const index = handbookChapters.findIndex((item) => item.slug === chapter.slug);
  const previous = handbookChapters[index - 1];
  const next = handbookChapters[index + 1];
  const websiteMode = membershipMode() === "website";

  return <article className={styles.card} aria-labelledby="chapter-title">
    <header className={styles.chapterHead}>
      <h2 id="chapter-title">{chapter.title}</h2>
      <p>{chapter.summary}</p>
      <ul className={styles.meta}>
        <li className={`${styles.pill} ${chapter.audience === "administrator" ? styles.pillAdmin : ""}`}>{audienceLabels[chapter.audience]}</li>
        {chapter.websiteMode ? <li className={`${styles.pill} ${styles.pillWebsite}`}>Website mode</li> : null}
        <li className={styles.pill}>Checked {reviewedLabel(chapter.reviewed)}</li>
      </ul>
      {chapter.websiteMode && !websiteMode ? <p className={`${styles.banner} ${styles.noPrint}`} style={{ marginTop: 16 }} role="note">These screens are switched off while membership is run in MemberMojo. This chapter describes how they work once the website takes over.</p> : null}
      <nav className={`${styles.onThisPage} ${styles.noPrint}`} aria-label="On this page">
        <strong>On this page</strong>
        <ul>{chapter.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
      </nav>
      <div className={`${styles.actions} ${styles.noPrint}`} style={{ marginTop: 16 }}><PrintButton label="Print this chapter"/></div>
    </header>
    <HandbookSections chapterSlug={chapter.slug} sections={chapter.sections}/>
    <nav className={styles.pager} aria-label="Previous and next chapter" style={{ marginTop: 28 }}>
      {previous ? <Link href={chapterHref(previous.slug)} prefetch={false}><small><ArrowLeft size={12}/> Previous</small>{previous.title}</Link> : <span/>}
      {next ? <Link href={chapterHref(next.slug)} prefetch={false}><small>Next <ArrowRight size={12}/></small>{next.title}</Link> : null}
    </nav>
  </article>;
}
