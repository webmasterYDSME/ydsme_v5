import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, Download, FileText, Pencil, RotateCcw, Upload } from "lucide-react";
import { format } from "date-fns";
import { canManageContent, isAdministrator, requireUser } from "@/lib/auth";
import {
  getMemberDocumentCounts,
  getPublishedMemberDocuments,
  type MemberDocumentSection,
} from "@/lib/dashboard-data";
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

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ error?: string; status?: string; page?: string }> }) {
  const [{ section }, query, { role }] = await Promise.all([params, searchParams, requireUser()]);
  const config = sections[section as keyof typeof sections];
  if (!config) notFound();
  const admin = createAdminClient();
  const editable = canManageContent(role);
  const status = editable && query.status === "archived" ? "archived" : "published";
  const pageSize = 12;
  const requestedPage = Number(query.page);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const firstRow = (currentPage - 1) * pageSize;
  const pageRequest = status === "published"
    ? getPublishedMemberDocuments(config.categories, firstRow, pageSize)
    : admin.from("documents")
      .select("id,name,descriptions,category,created_at,lifecycle_status,version", { count: "exact" })
      .in("category", [...config.categories])
      .eq("lifecycle_status", "archived")
      .order("created_at", { ascending: false })
      .range(firstRow, firstRow + pageSize - 1)
      .then((result) => {
        if (result.error) throw new Error("Unable to load documents.");
        return { data: result.data ?? [], count: result.count ?? 0 };
      });
  const [pageResult, publishedCounts, archivedCountResult] = await Promise.all([
    pageRequest,
    status === "archived" ? getMemberDocumentCounts() : Promise.resolve(null),
    editable && status === "published"
      ? admin.from("documents").select("id", { count: "exact", head: true }).in("category", [...config.categories]).eq("lifecycle_status", "archived")
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (archivedCountResult.error) throw new Error("Unable to load documents.");
  const selectedCount = pageResult.count;
  const pageCount = Math.max(1, Math.ceil(selectedCount / pageSize));
  const pageHref = (page: number) => editable ? `/dashboard/${section}?status=${status}&page=${page}` : `/dashboard/${section}?page=${page}`;
  if (currentPage > pageCount) redirect(pageHref(pageCount));
  const publishedCount = status === "published"
    ? selectedCount
    : publishedCounts?.[section as MemberDocumentSection] ?? 0;
  const archivedCount = status === "archived" ? selectedCount : archivedCountResult.count ?? 0;
  const docs = pageResult.data;

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Document archive</p><h1>{config.title}</h1><p>{config.copy}</p></div></header>
    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {editable ? <details className="manager-panel"><summary><Upload/>Upload a PDF</summary><form action={uploadDocument} className="stack-form upload-form"><label>Document name<input name="name" required/></label><label>Category<select name="category" defaultValue={config.categories[0]}>{config.categories.map(category => <option key={category} value={category}>{category.replaceAll("-", " ")}</option>)}</select></label><label>Description<textarea name="descriptions" rows={3}/></label><SignedUploadField kind="document" label="PDF file" required/><PendingSubmitButton className="button dark" pendingLabel="Uploading…"><Upload/>Upload document</PendingSubmitButton></form></details> : null}
    {editable ? <nav className="status-filter" aria-label={`Filter ${config.title.toLowerCase()} by status`}><Link prefetch={false} href={`/dashboard/${section}?status=published`} aria-current={status === "published" ? "page" : undefined}>Published <span>{publishedCount}</span></Link><Link prefetch={false} href={`/dashboard/${section}?status=archived`} aria-current={status === "archived" ? "page" : undefined}>Archived <span>{archivedCount}</span></Link></nav> : null}
    <section className="document-grid" aria-label={`${status === "archived" ? "Archived" : "Published"} ${config.title.toLowerCase()}`}>{docs.map(doc => <article key={doc.id}><FileText/><div><span>{doc.category.replaceAll("-", " ")} · version {doc.version} · {doc.lifecycle_status === "archived" ? "archived" : "available"}</span><h2>{doc.name}</h2><p>{doc.descriptions}</p><time>{format(new Date(doc.created_at), "d MMMM yyyy")}</time></div><div className="row-actions"><a href={`/dashboard/documents/${doc.id}/download`} target="_blank" rel="noreferrer"><Download/>Open PDF</a>{editable ? doc.lifecycle_status === "archived" ? <><form action={restoreDocument}><input type="hidden" name="id" value={doc.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore</PendingSubmitButton></form>{isAdministrator(role) ? <details className="document-action-details danger"><summary>Permanently delete</summary><form action={purgeDocument} className="stack-form"><input type="hidden" name="id" value={doc.id}/><label>Type DELETE DOCUMENT<input name="confirmation" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Deleting…">Delete file permanently</PendingSubmitButton></form></details> : null}</> : <><details className="document-action-details"><summary><Pencil/>Edit details</summary><form action={updateDocumentMetadata} className="stack-form"><input type="hidden" name="id" value={doc.id}/><label>Name<input name="name" defaultValue={doc.name} required/></label><label>Description<textarea name="descriptions" defaultValue={doc.descriptions}/></label><PendingSubmitButton className="button dark" pendingLabel="Saving…">Save details</PendingSubmitButton></form></details><details className="document-action-details"><summary><Upload/>Replace version</summary><form action={replaceDocumentVersion} className="stack-form"><input type="hidden" name="id" value={doc.id}/><SignedUploadField kind="document" label="Replacement PDF" required/><PendingSubmitButton className="button dark" pendingLabel="Replacing…">Replace PDF</PendingSubmitButton></form></details><form action={deleteDocument}><input type="hidden" name="id" value={doc.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></> : null}</div></article>)}{!docs.length ? <div className="empty-document"><FileText/><h2>No {status} documents</h2><p>{status === "archived" ? "Archived documents will appear here." : "This section is ready for its first document."}</p></div> : null}</section>
    {pageCount > 1 ? <nav className="pagination document-pagination" aria-label={`${config.title} pages`}>{currentPage > 1 ? <Link prefetch={false} href={pageHref(currentPage - 1)}>← Previous</Link> : <span/>}<span>Page {currentPage} of {pageCount}</span>{currentPage < pageCount ? <Link prefetch={false} href={pageHref(currentPage + 1)}>Next →</Link> : <span/>}</nav> : null}
  </div>;
}
