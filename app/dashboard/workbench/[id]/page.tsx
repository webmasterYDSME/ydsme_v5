import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Archive, ArrowLeft, CircleHelp, Eye, Hammer, ImageIcon, MessageCircle, Pencil, Plus, UserRound } from "lucide-react";
import { canManageContent, requireUser } from "@/lib/auth";
import {
  addProjectComment,
  addProjectUpdate,
  archiveProject,
  archiveProjectComment,
  toggleProjectFollow,
  updateProject,
} from "@/lib/actions/workbench";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { ProjectImageUploadField } from "@/app/components/ProjectImageUploadField";
import {
  categoryLabels,
  getWorkbenchProject,
  helpLabels,
  projectCategories,
  projectHelpTypes,
  projectStatuses,
  statusLabels,
} from "@/lib/workbench";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  "project-created": "Your project is live in the member Workbench.",
  "project-updated": "The project details were updated.",
  "progress-posted": "The progress update was added.",
  "comment-posted": "Your comment was added.",
};

export default async function WorkbenchProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const [{ id }, query, { user, role }] = await Promise.all([params, searchParams, requireUser()]);
  const project = await getWorkbenchProject(id, user.id);
  if (!project) notFound();
  const isOwner = project.owner_id === user.id;
  const canEdit = isOwner || canManageContent(role);
  const notice = query.notice ? noticeMessages[query.notice] : null;

  return <div className="portal-content workbench-detail-page">
    <Link href="/dashboard/workbench" prefetch={false} className="workbench-back"><ArrowLeft/>Back to Project Workbench</Link>
    {query.error ? <p className="form-message error">{query.error.replaceAll("+", " ")}</p> : null}
    {notice ? <p className="form-message success">{notice}</p> : null}

    <article className="workbench-project-hero">
      <div className="workbench-project-hero-image">
        {project.cover_image_url ? <Image src={project.cover_image_url} alt="" fill sizes="(max-width: 900px) 100vw, 48vw" quality={55}/> : <span><Hammer aria-hidden="true"/></span>}
      </div>
      <div className="workbench-project-hero-copy">
        <div className="workbench-project-meta"><span>{categoryLabels[project.category]}</span><span className={`workbench-status status-${project.project_status}`}>{statusLabels[project.project_status]}</span></div>
        <h1>{project.title}</h1>
        <p className="workbench-project-summary">{project.summary}</p>
        <div className="workbench-project-owner"><UserRound aria-hidden="true"/><div><span>Project owner</span><strong>{project.owner_name}</strong></div></div>
        <dl className="workbench-project-stats">
          <div><dt><Plus/>Updates</dt><dd>{project.updates.length}</dd></div>
          <div><dt><MessageCircle/>Comments</dt><dd>{project.comments.length}</dd></div>
          <div><dt><Eye/>Followers</dt><dd>{project.follower_count}</dd></div>
        </dl>
        {!isOwner ? <form action={toggleProjectFollow}><input type="hidden" name="project_id" value={project.id}/><PendingSubmitButton className={project.followed_by_me ? "button outline" : "button dark"} pendingLabel="Updating…">{project.followed_by_me ? "Following · stop following" : "Follow this project"}</PendingSubmitButton></form> : <span className="workbench-owner-note">This is your project journal.</span>}
      </div>
    </article>

    {canEdit ? <details className="portal-card workbench-project-editor">
      <summary><Pencil/>Edit project details</summary>
      <form action={updateProject} className="editor-form">
        <input type="hidden" name="project_id" value={project.id}/>
        <label>Project title<input name="title" defaultValue={project.title} minLength={2} maxLength={120} required/></label>
        <label>Short introduction<textarea name="summary" defaultValue={project.summary} minLength={10} maxLength={1200} rows={5} required/></label>
        <div className="form-grid">
          <label>Category<select name="category" defaultValue={project.category}>{projectCategories.map((category) => <option value={category} key={category}>{categoryLabels[category]}</option>)}</select></label>
          <label>Status<select name="project_status" defaultValue={project.project_status}>{projectStatuses.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
        </div>
        <ProjectImageUploadField label="Replace cover photograph (optional)" maximum={1}/>
        <div className="workbench-editor-actions"><PendingSubmitButton className="button dark" pendingLabel="Saving project…">Save project</PendingSubmitButton></div>
      </form>
      <form action={archiveProject} className="workbench-archive-form"><input type="hidden" name="project_id" value={project.id}/><PendingSubmitButton confirmMessage="Archive this project? It will be removed from the Workbench." pendingLabel="Archiving…"><Archive/>Archive project</PendingSubmitButton></form>
    </details> : null}

    {isOwner ? <section className="portal-card workbench-progress-composer" aria-labelledby="add-progress-heading">
      <header><div><p className="eyebrow dark">From your bench</p><h2 id="add-progress-heading">Add a progress update</h2></div><Plus/></header>
      <form action={addProjectUpdate} className="editor-form">
        <input type="hidden" name="project_id" value={project.id}/>
        <label>Update title<input name="title" minLength={2} maxLength={120} required placeholder="e.g. Chassis stripped and inspected"/></label>
        <label>What changed?<textarea name="body" minLength={2} maxLength={5000} rows={6} required placeholder="Share what you did, what you discovered and what comes next."/></label>
        <label>Help wanted (optional)<select name="help_type" defaultValue=""><option value="">No help request</option>{projectHelpTypes.map((helpType) => <option value={helpType} key={helpType}>{helpLabels[helpType]}</option>)}</select></label>
        <ProjectImageUploadField label="Progress photographs (optional)" maximum={5}/>
        <PendingSubmitButton className="button dark" pendingLabel="Posting progress…">Post progress update</PendingSubmitButton>
      </form>
    </section> : null}

    <section id="project-timeline" className="workbench-timeline" aria-labelledby="project-timeline-heading">
      <header><div><p className="eyebrow dark">Build diary</p><h2 id="project-timeline-heading">Progress timeline</h2></div><span>{project.updates.length} {project.updates.length === 1 ? "entry" : "entries"}</span></header>
      {project.updates.length ? <div className="workbench-timeline-list">{project.updates.map((update, index) => <article key={update.id} className="workbench-update">
        <div className="workbench-timeline-marker"><span>{String(project.updates.length - index).padStart(2, "0")}</span></div>
        <div className="workbench-update-card">
          <header><div><time dateTime={update.created_at}>{format(new Date(update.created_at), "d MMMM yyyy")}</time><h3>{update.title}</h3></div>{update.help_type ? <span className="workbench-help-chip"><CircleHelp/>{helpLabels[update.help_type]}</span> : null}</header>
          <p>{update.body}</p>
          {update.photos.length ? <div className={`workbench-photo-grid photos-${Math.min(update.photos.length, 3)}`}>{update.photos.map((photo) => photo.image_url ? <figure key={photo.id}><Image src={photo.image_url} alt={photo.caption || `Progress photograph for ${update.title}`} fill sizes="(max-width: 700px) 100vw, 33vw" quality={55}/>{photo.caption ? <figcaption>{photo.caption}</figcaption> : null}</figure> : null)}</div> : null}
        </div>
      </article>)}</div> : <div className="workbench-empty timeline-empty"><ImageIcon aria-hidden="true"/><h3>The journal is ready</h3><p>The first progress update will begin this project’s story.</p></div>}
    </section>

    <section id="project-discussion" className="portal-card workbench-discussion" aria-labelledby="project-discussion-heading">
      <header><div><p className="eyebrow dark">Knowledge shared</p><h2 id="project-discussion-heading">Member discussion</h2></div><MessageCircle/></header>
      {project.comments.length ? <div className="workbench-comment-list">{project.comments.map((comment) => <article key={comment.id}><div className="workbench-comment-avatar" aria-hidden="true">{comment.author_name.slice(0, 1).toUpperCase()}</div><div><div><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{format(new Date(comment.created_at), "d MMM yyyy · HH:mm")}</time></div><p>{comment.body}</p>{(comment.author_id === user.id || canManageContent(role)) ? <form action={archiveProjectComment}><input type="hidden" name="project_id" value={project.id}/><input type="hidden" name="comment_id" value={comment.id}/><PendingSubmitButton confirmMessage="Remove this comment?" pendingLabel="Removing…">Remove</PendingSubmitButton></form> : null}</div></article>)}</div> : <p className="workbench-no-comments">No comments yet. Ask a question or offer some encouragement.</p>}
      <form action={addProjectComment} className="workbench-comment-form"><input type="hidden" name="project_id" value={project.id}/><label>Add to the discussion<textarea name="body" minLength={2} maxLength={1500} rows={4} required placeholder="Offer advice, ask a question or volunteer to help."/></label><PendingSubmitButton className="button dark" pendingLabel="Posting comment…">Post comment</PendingSubmitButton></form>
    </section>
  </div>;
}
