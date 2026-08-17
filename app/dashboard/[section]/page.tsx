import { notFound } from "next/navigation";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { canManageContent, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDocument, uploadDocument } from "@/lib/actions/content";

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
  const { data, error } = await admin.from("documents").select("id,name,descriptions,category,file_url,created_at").in("category", [...config.categories]).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const docs = await Promise.all((data ?? []).map(async doc => {
    const path = doc.file_url.startsWith("documents/") ? doc.file_url.slice(10) : doc.file_url;
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(path, 300);
    return { ...doc, signedUrl: signed?.signedUrl };
  }));
  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Document archive</p><h1>{config.title}</h1><p>{config.copy}</p></div></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{canManageContent(role) ? <details className="manager-panel"><summary><Upload/>Upload a PDF</summary><form action={uploadDocument} className="stack-form upload-form" encType="multipart/form-data"><label>Document name<input name="name" required/></label><label>Category<select name="category" defaultValue={config.categories[0]}>{config.categories.map(category=><option key={category} value={category}>{category.replaceAll("-"," ")}</option>)}</select></label><label>Description<textarea name="descriptions" rows={3}/></label><label>PDF file<input name="file" type="file" accept="application/pdf" required/></label><button className="button dark" type="submit"><Upload/>Upload document</button></form></details> : null}<section className="document-grid">{docs.map(doc=><article key={doc.id}><FileText/><div><span>{doc.category.replaceAll("-"," ")}</span><h2>{doc.name}</h2><p>{doc.descriptions}</p><time>{format(new Date(doc.created_at), "d MMMM yyyy")}</time></div><div className="row-actions">{doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer"><Download/>Open PDF</a> : null}{canManageContent(role) ? <form action={deleteDocument}><input type="hidden" name="id" value={doc.id}/><button type="submit"><Trash2/>Remove</button></form> : null}</div></article>)}{!docs.length ? <div className="empty-document"><FileText/><h2>No documents yet</h2><p>The archive is ready for its first file.</p></div> : null}</section></div>;
}
