import Link from "next/link";
import { BookOpen, FileText, Newspaper } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMemberDocumentCounts } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const librarySections = [
  {
    key: "minutes",
    href: "/dashboard/minutes",
    title: "Committee minutes",
    description: "Formal records of Society meetings and committee decisions.",
    categories: ["minute"],
    icon: FileText,
  },
  {
    key: "publications",
    href: "/dashboard/publications",
    title: "Society publications",
    description: "Newsletters and publications produced for members.",
    categories: ["publication"],
    icon: Newspaper,
  },
  {
    key: "resources",
    href: "/dashboard/resources",
    title: "Member resources",
    description: "Rules, insurance, calendars, boiler guidance and useful files.",
    categories: ["insurance-policy", "club-rule", "calendar", "boiler-guide", "others"],
    icon: BookOpen,
  },
] as const;

export default async function SocietyLibraryPage() {
  await requireUser();
  const counts = await getMemberDocumentCounts();

  return <div className="portal-content">
    <header className="portal-heading">
      <div>
        <p className="eyebrow dark">Member documents</p>
        <h1>Society library</h1>
        <p>Find meeting records, Society publications and useful documents in one place.</p>
      </div>
      <BookOpen aria-hidden="true"/>
    </header>
    <section className="library-grid" aria-label="Library sections">
      {librarySections.map((section) => {
        const Icon = section.icon;
        const count = counts[section.key];
        return <Link href={section.href} className="library-card" key={section.href}>
          <span className="library-card-icon"><Icon aria-hidden="true"/></span>
          <div>
            <span>{count} {count === 1 ? "document" : "documents"}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </div>
          <strong aria-hidden="true">View documents →</strong>
        </Link>;
      })}
    </section>
  </div>;
}
