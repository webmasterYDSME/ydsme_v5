import type { Metadata } from "next";
import styles from "./under-review.module.css";

export const metadata: Metadata = {
  title: "Website under review",
  description: "The new York Model Engineers website is currently under committee review.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function UnderReviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="review-title">
        <p className={styles.kicker}>York City &amp; District Society of Model Engineers</p>
        <div className={styles.mark} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 id="review-title">Website under review</h1>
        <p className={styles.lead}>
          Our new website is currently being reviewed by the Society&apos;s committee before it is published.
        </p>
        <p className={styles.note}>Please check back after the review has been completed.</p>
      </section>
      <p className={styles.footer}>York Model Engineers · Established 1929</p>
    </main>
  );
}
