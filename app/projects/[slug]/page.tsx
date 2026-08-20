import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, Hammer, UserRound } from "lucide-react";
import { format } from "date-fns";
import { PageShell } from "@/app/components/PageShell";
import { getPublicFeaturedProject } from "@/lib/public-projects";
import { categoryLabels } from "@/lib/workbench";
import { SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicFeaturedProject(slug);
  if (!project) return { title: "Project not found", robots: { index: false, follow: false } };

  const description = project.summary.slice(0, 160);
  const images = project.cover_image_url
    ? [{ url: project.cover_image_url, alt: project.title }]
    : [];
  return {
    title: project.title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: `${project.title} | ${SITE_NAME}`,
      description,
      url: `/projects/${project.slug}`,
      images,
    },
    twitter: {
      card: project.cover_image_url ? "summary_large_image" : "summary",
      title: `${project.title} | ${SITE_NAME}`,
      description,
      images: project.cover_image_url ? [project.cover_image_url] : [],
    },
  };
}

export default async function PublicProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getPublicFeaturedProject(slug);
  if (!project) notFound();

  return <PageShell headerTheme="light">
    <article className="public-project-detail">
      <header className="public-project-hero">
        <div className="public-project-hero-image">
          {project.cover_image_url
            ? <Image src={project.cover_image_url} alt="" fill loading="eager" sizes="(max-width: 860px) 100vw, 52vw" quality={55}/>
            : <span><Hammer aria-hidden="true"/></span>}
        </div>
        <div className="public-project-hero-copy">
          <Link href="/projects" className="public-project-back"><ArrowLeft/>All member projects</Link>
          <p className="eyebrow dark">{categoryLabels[project.category]}</p>
          <h1>{project.title}</h1>
          <p className="public-project-summary">{project.summary}</p>
          <div className="public-project-byline"><span><UserRound aria-hidden="true"/><strong>{project.owner_byline}</strong></span><span><CalendarCheck aria-hidden="true"/>Completed {format(new Date(project.completed_at), "MMMM yyyy")}</span></div>
        </div>
      </header>

      <section className="section public-project-story" aria-labelledby="public-project-story-heading">
        <header><p className="eyebrow dark">The build diary</p><h2 id="public-project-story-heading">How it came together.</h2><p>This completed project was shared by its owner and reviewed before publication.</p></header>
        {project.updates.length ? <div className="public-project-updates">
          {project.updates.map((update, index) => <article className="public-project-update" key={update.id}>
            <div className="public-project-update-number">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <time dateTime={update.created_at}>{format(new Date(update.created_at), "d MMMM yyyy")}</time>
              <h3>{update.title}</h3>
              <p>{update.body}</p>
              {update.photos.length ? <div className={`public-project-photo-grid photos-${Math.min(update.photos.length, 3)}`}>
                {update.photos.map((photo) => photo.image_url ? <figure key={photo.id}><Image src={photo.image_url} alt={photo.caption || `Project photograph for ${update.title}`} fill sizes="(max-width: 720px) 100vw, 33vw" quality={55}/>{photo.caption ? <figcaption>{photo.caption}</figcaption> : null}</figure> : null)}
              </div> : null}
            </div>
          </article>)}
        </div> : <div className="public-projects-empty"><Hammer aria-hidden="true"/><h3>A completed workshop story.</h3><p>The owner shared the finished project without publishing its private progress notes.</p></div>}
      </section>
    </article>
  </PageShell>;
}
