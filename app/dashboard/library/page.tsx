import Link from "next/link";
import { BookOpen, FileText, Newspaper } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const librarySections = [
  {
    href: "/dashboard/minutes",
    title: "Committee minutes",
    description: "Formal records of Society meetings and committee decisions.",
    categories: ["minute"],
    icon: FileText,
  },
  {
    href: "/dashboard/publications",
    title: "Society publications",
    description: "Newsletters and publications produced for members.",
    categories: ["publication"],
    icon: Newspaper,
  },
  {
    href: "/dashboard/resources",
    title: "Member resources",
    description: "Rules, insurance, calendars, boiler guidance and useful files.",
    categories: ["insurance-policy", "club-rule", "calendar", "boiler-guide", "others"],
    icon: BookOpen,
  },
] as const;

export default async function SocietyLibraryPage() {
  await requireUser();
  const client = await createClient();
  const counts = await Promise.all(librarySections.map((section) => client.from("documents")
    .select("id", { count: "exact", head: true })
    .in("category", [...section.categories])
    .eq("lifecycle_status", "published")));

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
      {librarySections.map((section, index) => {
        const Icon = section.icon;
        const count = counts[index].error ? null : counts[index].count ?? 0;
        return <Link href={section.href} className="library-card" key={section.href}>
          <span className="library-card-icon"><Icon aria-hidden="true"/></span>
          <div>
            <span>{count === null ? "Member documents" : `${count} ${count === 1 ? "document" : "documents"}`}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </div>
          <strong aria-hidden="true">View documents →</strong>
        </Link>;
      })}
    </section>
  </div>;
}
