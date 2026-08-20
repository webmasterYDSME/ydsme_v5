import Form from "next/form";
import Link from "next/link";
import { CircleHelp, Globe2, Hammer, Plus, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { canManageContent, requireUser } from "@/lib/auth";
import { ProjectCard } from "@/app/dashboard/workbench/ProjectCard";
import {
  categoryLabels,
  getPendingPublicFeatureRequests,
  getWorkbenchProjects,
  projectCategories,
  projectStatuses,
  statusLabels,
  type ProjectCategory,
  type ProjectStatus,
} from "@/lib/workbench";

export const dynamic = "force-dynamic";

type WorkbenchQuery = { category?: string; status?: string; scope?: string; help?: string; error?: string; notice?: string };

export default async function WorkbenchPage({ searchParams }: { searchParams: Promise<WorkbenchQuery> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const category = projectCategories.includes(query.category as ProjectCategory) ? query.category as ProjectCategory : undefined;
  const status = projectStatuses.includes(query.status as ProjectStatus) ? query.status as ProjectStatus : undefined;
  const scope = query.scope === "mine" || query.scope === "following" ? query.scope : undefined;
  const helpOnly = query.help === "yes";
  const [projects, publicFeatureReviews] = await Promise.all([
    getWorkbenchProjects({ userId: user.id, category, status, scope, helpOnly }),
    canManageContent(role) ? getPendingPublicFeatureRequests() : Promise.resolve([]),
  ]);

  return <div className="portal-content workbench-page">
    <header className="portal-heading workbench-heading">
      <div><p className="eyebrow dark">Members’ project journals</p><h1>Project Workbench</h1><p>Follow what members are building, share progress and lend a hand when a project gets stuck.</p></div>
      <Link href="/dashboard/workbench/new" prefetch={false} className="button dark"><Plus/>Start a project</Link>
    </header>
    {query.error ? <p className="form-message error">The requested Workbench change could not be completed.</p> : null}
    {query.notice ? <p className="form-message success">The Workbench has been updated.</p> : null}

    {publicFeatureReviews.length ? <section className="workbench-feature-queue" aria-labelledby="feature-review-queue-heading">
      <header><ShieldCheck aria-hidden="true"/><div><p className="eyebrow dark">Committee review queue</p><h2 id="feature-review-queue-heading">Public feature requests</h2></div><span>{publicFeatureReviews.length}</span></header>
      <div>{publicFeatureReviews.map((request) => <Link href={`/dashboard/workbench/${request.project_id}#public-feature`} key={request.project_id}><Globe2 aria-hidden="true"/><span><strong>{request.title}</strong><small>{request.show_owner_name ? "Named owner byline consented" : "Anonymous Society member byline"}</small></span><span>Review</span></Link>)}</div>
    </section> : null}

    <nav className="workbench-scope-tabs" aria-label="Project view">
      <Link href="/dashboard/workbench" aria-current={!scope && !helpOnly ? "page" : undefined}>All projects</Link>
      <Link href="/dashboard/workbench?scope=mine" aria-current={scope === "mine" ? "page" : undefined}>My projects</Link>
      <Link href="/dashboard/workbench?scope=following" aria-current={scope === "following" ? "page" : undefined}>Following</Link>
      <Link href="/dashboard/workbench?help=yes" aria-current={helpOnly ? "page" : undefined}><CircleHelp/>Help wanted</Link>
    </nav>

    <Form action="/dashboard/workbench" className="workbench-filters">
      <SlidersHorizontal aria-hidden="true"/>
      <label>Category<select name="category" defaultValue={category ?? ""}><option value="">All categories</option>{projectCategories.map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{projectStatuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>
      {scope ? <input type="hidden" name="scope" value={scope}/> : null}
      {helpOnly ? <input type="hidden" name="help" value="yes"/> : null}
      <button type="submit">Apply filters</button>
    </Form>

    {projects.length ? <section className="workbench-project-grid" aria-label="Member projects">{projects.map((project) => <ProjectCard project={project} key={project.id}/>)}</section> : <section className="workbench-empty"><Hammer aria-hidden="true"/><h2>No projects found</h2><p>{scope === "mine" ? "Start a project and share what is on your bench." : scope === "following" ? "Follow a project to keep it close at hand." : "Try clearing the filters or start the first project."}</p><Link href="/dashboard/workbench/new" className="button dark">Start a project</Link></section>}
  </div>;
}
