import Image from "next/image";
import Link from "next/link";
import { CircleHelp, Eye, MessageCircle, NotebookPen, UserRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WorkbenchProjectCard } from "@/lib/workbench";
import { categoryLabels, helpLabels, statusLabels } from "@/lib/workbench";

export function ProjectCard({ project }: { project: WorkbenchProjectCard }) {
  return <article className="workbench-project-card">
    <Link href={`/dashboard/workbench/${project.id}`} prefetch={false} className="workbench-project-cover" aria-label={`Open ${project.title}`}>
      {project.cover_image_url
        ? <Image src={project.cover_image_url} alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 33vw" quality={55}/>
        : <span className="workbench-project-placeholder"><NotebookPen aria-hidden="true"/></span>}
      <span className={`workbench-status status-${project.project_status}`}>{statusLabels[project.project_status]}</span>
    </Link>
    <div className="workbench-project-card-body">
      <div className="workbench-project-meta"><span>{categoryLabels[project.category]}</span><span><UserRound aria-hidden="true"/>{project.owner_name}</span></div>
      <h2><Link href={`/dashboard/workbench/${project.id}`} prefetch={false}>{project.title}</Link></h2>
      <p>{project.summary}</p>
      {project.latest_update?.help_type ? <div className="workbench-help-chip"><CircleHelp aria-hidden="true"/>{helpLabels[project.latest_update.help_type]}</div> : null}
      {project.latest_update ? <p className="workbench-latest"><strong>Latest:</strong> {project.latest_update.title} · {formatDistanceToNow(new Date(project.latest_update.created_at), { addSuffix: true })}</p> : <p className="workbench-latest">Ready for its first progress update.</p>}
      <footer>
        <span><NotebookPen aria-hidden="true"/>{project.update_count} updates</span>
        <span><MessageCircle aria-hidden="true"/>{project.comment_count}</span>
        <span><Eye aria-hidden="true"/>{project.follower_count}</span>
      </footer>
    </div>
  </article>;
}
