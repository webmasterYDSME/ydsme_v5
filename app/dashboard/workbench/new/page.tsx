import Link from "next/link";
import { ArrowLeft, Hammer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createProject } from "@/lib/actions/workbench";
import { ProjectImageUploadField } from "@/app/components/ProjectImageUploadField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { categoryLabels, projectCategories } from "@/lib/workbench";

export const dynamic = "force-dynamic";

export default async function NewWorkbenchProject({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [, query] = await Promise.all([requireUser(), searchParams]);
  return <div className="portal-content narrow workbench-editor-page">
    <Link href="/dashboard/workbench" prefetch={false} className="workbench-back"><ArrowLeft/>Back to Project Workbench</Link>
    <header className="portal-heading"><div><p className="eyebrow dark">Open a new journal</p><h1>Start a project</h1><p>Introduce what you are making, restoring or improving. You can add detailed progress updates afterwards.</p></div><Hammer/></header>
    {query.error ? <p className="form-message error">{query.error.replaceAll("+", " ")}</p> : null}
    <section className="portal-card workbench-editor-card">
      <form action={createProject} className="editor-form">
        <label>Project title<input name="title" minLength={2} maxLength={120} required placeholder="e.g. Restoring a 5-inch gauge battery locomotive"/></label>
        <label>Short introduction<textarea name="summary" minLength={10} maxLength={1200} rows={6} required placeholder="What are you making, why did you begin, and what are you aiming to achieve?"/></label>
        <div className="form-grid">
          <label>Category<select name="category" defaultValue="locomotive">{projectCategories.map((category) => <option value={category} key={category}>{categoryLabels[category]}</option>)}</select></label>
          <label>Current status<select name="project_status" defaultValue="planning"><option value="planning">Planning</option><option value="in-progress">In progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
        </div>
        <ProjectImageUploadField label="Cover photograph (optional)" maximum={1}/>
        <p className="form-help">Member projects are visible only inside the Society portal. Photographs remain in private member storage.</p>
        <PendingSubmitButton className="button dark" pendingLabel="Starting project…"><Hammer/>Start project</PendingSubmitButton>
      </form>
    </section>
  </div>;
}
