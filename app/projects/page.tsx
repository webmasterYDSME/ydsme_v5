import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Hammer, UserRound } from "lucide-react";
import { PageShell } from "@/app/components/PageShell";
import { Reveal } from "@/app/components/RailSite";
import { getPublicFeaturedProjects } from "@/lib/public-projects";
import { categoryLabels } from "@/lib/workbench";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = {
  ...publicPageMetadata({
    title: "Completed Member Projects",
    description: "Explore completed model engineering projects shared publicly by York Model Engineers members.",
    path: "/projects",
    keywords: ["model engineering projects", "miniature railway projects", "member workshop projects"],
  }),
  robots: { index: true, follow: true },
};

export default async function PublicProjectsPage() {
  const projects = await getPublicFeaturedProjects();

  return <PageShell headerTheme="light">
    <section className="section public-projects-page" aria-labelledby="public-projects-heading">
      <header className="public-projects-heading">
        <div><p className="eyebrow dark">Made by Society members</p><h1 id="public-projects-heading">From the workbench.</h1></div>
        <p>Completed builds, restorations and workshop stories shared by their owners.</p>
      </header>

      {projects.length ? <div className="public-project-grid">
        {projects.map((project, index) => <Reveal key={project.project_id} delay={index * 0.04}>
          <article className="public-project-card">
            <Link href={`/projects/${project.slug}`} className="public-project-card-image" aria-label={`Read ${project.title}`}>
              {project.cover_image_url
                ? <Image src={project.cover_image_url} alt="" fill sizes="(max-width: 720px) 100vw, 50vw" quality={55}/>
                : <span><Hammer aria-hidden="true"/></span>}
            </Link>
            <div className="public-project-card-copy">
              <p className="public-project-category">{categoryLabels[project.category]}</p>
              <h2><Link href={`/projects/${project.slug}`}>{project.title}</Link></h2>
              <p>{project.summary}</p>
              <footer><span><UserRound aria-hidden="true"/>{project.owner_byline}</span><Link href={`/projects/${project.slug}`}>Read the project <ArrowRight/></Link></footer>
            </div>
          </article>
        </Reveal>)}
      </div> : <div className="public-projects-empty"><Hammer aria-hidden="true"/><h2>The showcase is being prepared.</h2><p>Owner-consented completed projects will appear here after Society review.</p></div>}
    </section>
  </PageShell>;
}
