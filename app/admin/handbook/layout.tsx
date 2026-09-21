import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BookOpen, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { membershipMode } from "@/lib/features";
import { handbookChapters } from "@/lib/handbook";
import { audienceLabels } from "@/lib/handbook/text";
import { HandbookNav, type NavChapter } from "./_components/HandbookNav";
import styles from "./handbook.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Membership officer handbook" };

export default async function HandbookLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  // Administrators count as membership officers. Other committee members need the responsibility.
  if (!session.membershipOfficer) redirect("/dashboard?notice=not-authorised");
  const websiteMode = (await membershipMode()) === "website";
  const chapters: NavChapter[] = handbookChapters.map((chapter) => ({
    slug: chapter.slug,
    title: chapter.title,
    note: chapter.audience === "administrator" ? audienceLabels.administrator : chapter.websiteMode && !websiteMode ? "Website mode" : null,
  }));
  return <div className={`portal-content handbook-print ${styles.page}`}>
    <header className="portal-heading">
      <div>
        <p className="eyebrow dark">Membership team</p>
        <h1>Membership officer handbook</h1>
        <p>How the membership system works and how to do each job. Written for the people who look after the register, and kept up to date with the screens.</p>
      </div>
      <BookOpen/>
    </header>
    <form className={`${styles.searchForm} ${styles.noPrint}`} action="/admin/handbook" role="search">
      <input type="search" name="q" placeholder="Search the handbook, for example “lapsed” or “cheque”" aria-label="Search the handbook" autoComplete="off"/>
      <button className="button dark" type="submit"><Search/>Search</button>
    </form>
    <p className={`${styles.banner} ${websiteMode ? styles.bannerGood : ""} ${styles.noPrint}`} role="note">
      {websiteMode
        ? "The website is running membership now (website mode), so every screen in this handbook is available."
        : "Membership is still run in MemberMojo (MemberMojo mode). The Memberships screens are switched off, so chapters marked Website mode describe what you will use once the website takes over. The MemberMojo list and email chapters apply now."}
    </p>
    <div className={styles.layout}>
      <HandbookNav chapters={chapters}/>
      <div>{children}</div>
    </div>
  </div>;
}
