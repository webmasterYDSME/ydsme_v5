import { notFound } from "next/navigation";
import { Archive, Download, FileText, Pencil, RotateCcw, Upload } from "lucide-react";
import { format } from "date-fns";
import { canManageContent, isAdministrator, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDocument, purgeDocument, replaceDocumentVersion, restoreDocument, updateDocumentMetadata, uploadDocument } from "@/lib/actions/content";
import { SignedUploadField } from "@/app/components/SignedUploadField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export const dynamic = "force-dynamic";

const sections = {
  minutes: { title: "Committee minutes", copy: "The formal record of Society meetings.", categories: ["minute"] },
  publications: { title: "Society publications", copy: "Newsletters and publications from the club.", categories: ["publication"] },
  resources: { title: "Member resources", copy: "Rules, insurance, calendars, boiler guidance and useful files.", categories: ["insurance-policy", "club-rule", "calendar", "boiler-guide", "others"] },
} as const;

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ section }, query, { role }] = await Promise.all([params, searchParams, requireUser()]);
  const config = sections[section as keyof typeof sections];
  if (!config) notFound();
  const admin = createAdminClient();
  const editable = canManageContent(role);
  let documentQuery = admin.from("documents").select("id,name,descriptions,category,file_url,created_at,lifecycle_status,version").in("category", [...config.categories]);
  if (!editable) documentQuery = documentQuery.eq("lifecycle_status", "published");
  const { data, error } = await documentQuery.order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load documents.");
  const docs = await Promise.all((data ?? []).map(async doc => {
    const path = doc.file_url.startsWith("documents/") ? doc.file_url.slice(10) : doc.file_url;
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(path, 300);
    return { ...doc, signedUrl: signed?.signedUrl };
  }));

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Document archive</p><h1>{config.title}</h1><p>{config.copy}</p></div></header>
    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {editable ? <details className="manager-panel"><summary><Upload/>Upload a PDF</summary><form action={uploadDocument} className="stack-form upload-form"><label>Document name<input name="name" required/></label><label>Category<select name="category" defaultValue={config.categories[0]}>{config.categories.map(category => <option key={category} value={category}>{category.replaceAll("-", " ")}</option>)}</select></label><label>Description<textarea name="descriptions" rows={3}/></label><SignedUploadField kind="document" label="PDF file" required/><PendingSubmitButton className="button dark" pendingLabel="Uploading…"><Upload/>Upload document</PendingSubmitButton></form></details> : null}
    <section className="document-grid">{docs.map(doc => <article key={doc.id}><FileText/><div><span>{doc.category.replaceAll("-", " ")} · version {doc.version} · {doc.lifecycle_status}</span><h2>{doc.name}</h2><p>{doc.descriptions}</p><time>{format(new Date(doc.created_at), "d MMMM yyyy")}</time></div><div className="row-actions">{doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer"><Download/>Open PDF</a> : null}{editable ? doc.lifecycle_status === "archived" ? <><form action={restoreDocument}><input type="hidden" name="id" value={doc.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore</PendingSubmitButton></form>{isAdministrator(role) ? <details><summary>Permanent purge</summary><form action={purgeDocument} className="stack-form"><input type="hidden" name="id" value={doc.id}/><label>Type PURGE DOCUMENT<input name="confirmation" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Purging…">Purge file</PendingSubmitButton></form></details> : null}</> : <><details><summary><Pencil/>Edit details</summary><form action={updateDocumentMetadata} className="stack-form"><input type="hidden" name="id" value={doc.id}/><label>Name<input name="name" defaultValue={doc.name} required/></label><label>Description<textarea name="descriptions" defaultValue={doc.descriptions}/></label><PendingSubmitButton pendingLabel="Saving…">Save metadata</PendingSubmitButton></form></details><details><summary><Upload/>Replace version</summary><form action={replaceDocumentVersion} className="stack-form"><input type="hidden" name="id" value={doc.id}/><SignedUploadField kind="document" label="Replacement PDF" required/><PendingSubmitButton pendingLabel="Replacing…">Replace PDF</PendingSubmitButton></form></details><form action={deleteDocument}><input type="hidden" name="id" value={doc.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></> : null}</div></article>)}{!docs.length ? <div className="empty-document"><FileText/><h2>No documents yet</h2><p>The archive is ready for its first file.</p></div> : null}</section>
  </div>;
}
