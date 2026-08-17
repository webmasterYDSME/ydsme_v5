import type { ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "./RailSite";

const legalLinks = [
  ["Privacy notice", "/privacy-policy"],
  ["Cookie notice", "/cookie-policy"],
  ["Health & safety", "/documents/visitor-safety-guide.pdf"],
];

export function LegalPage({
  eyebrow,
  title,
  summary,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  children: ReactNode;
}) {
  return <PageShell>
    <header className="legal-masthead">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{summary}</p>
        <time dateTime="2026-08-17">Last reviewed {updated}</time>
      </div>
    </header>
    <div className="legal-layout">
      <aside>
        <span>Society information</span>
        <nav aria-label="Legal notices">
          {legalLinks.map(([label, href]) => href.endsWith(".pdf")
            ? <a key={href} href={href} target="_blank" rel="noreferrer">{label}</a>
            : <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </aside>
      <article className="legal-copy">{children}</article>
    </div>
  </PageShell>;
}
