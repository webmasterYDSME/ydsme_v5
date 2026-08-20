"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageContent, requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { finalizeQuarantinedUpload } from "@/lib/uploads";
import { projectCategories, projectHelpTypes, projectStatuses } from "@/lib/workbench";

const projectId = z.string().uuid();
const projectSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(10).max(1200),
  category: z.enum(projectCategories),
  project_status: z.enum(projectStatuses),
});
const updateSchema = z.object({
  project_id: projectId,
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(5000),
  help_type: z.union([z.literal(""), z.enum(projectHelpTypes)]),
});
const commentSchema = z.object({
  project_id: projectId,
  body: z.string().trim().min(2).max(1500),
});

function workbenchPath(id?: string) {
  return id ? `/dashboard/workbench/${id}` : "/dashboard/workbench";
}

function quarantinePaths(formData: FormData, maximum: number) {
  const paths = [...new Set(formData.getAll("quarantine_path").map(String).filter(Boolean))];
  return paths.length <= maximum ? paths : [];
}

async function removeProjectImages(paths: string[]) {
  if (paths.length) await createServiceClient().storage.from("project-images").remove(paths);
}

export async function createProject(formData: FormData) {
  const { user } = await requireUser();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${workbenchPath()}/new?error=Please+check+the+project+details.`);
  const uploads = quarantinePaths(formData, 1);
  if (formData.getAll("quarantine_path").length > 1) redirect(`${workbenchPath()}/new?error=Choose+one+cover+photograph.`);

  let coverPath: string | null = null;
  try {
    if (uploads[0]) coverPath = (await finalizeQuarantinedUpload("project-image", uploads[0], user.id)).path;
  } catch {
    redirect(`${workbenchPath()}/new?error=The+cover+photograph+failed+security+validation.`);
  }

  const { data, error } = await createServiceClient().from("member_projects").insert({
    ...parsed.data,
    owner_id: user.id,
    cover_image_path: coverPath,
    completed_at: parsed.data.project_status === "completed" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error || !data) {
    if (coverPath) await removeProjectImages([coverPath]);
    redirect(`${workbenchPath()}/new?error=The+project+could+not+be+created.`);
  }
  revalidatePath("/dashboard");
  revalidatePath(workbenchPath());
  redirect(`${workbenchPath(String(data.id))}?notice=project-created`);
}

export async function updateProject(formData: FormData) {
  const { user, role } = await requireUser();
  const id = projectId.safeParse(formData.get("project_id"));
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) redirect(`${workbenchPath(String(formData.get("project_id") || ""))}?error=Please+check+the+project+details.`);
  const client = createServiceClient();
  const { data: before, error: lookupError } = await client.from("member_projects")
    .select("id,owner_id,cover_image_path,project_status")
    .eq("id", id.data).is("archived_at", null).maybeSingle();
  if (lookupError || !before) redirect(`${workbenchPath()}?error=Project+not+found.`);
  if (before.owner_id !== user.id && !canManageContent(role)) redirect(`${workbenchPath(id.data)}?error=You+cannot+edit+this+project.`);

  const uploads = quarantinePaths(formData, 1);
  let coverPath = before.cover_image_path as string | null;
  let newCoverPath: string | null = null;
  try {
    if (uploads[0]) {
      newCoverPath = (await finalizeQuarantinedUpload("project-image", uploads[0], user.id)).path;
      coverPath = newCoverPath;
    }
  } catch {
    redirect(`${workbenchPath(id.data)}?error=The+new+cover+photograph+failed+security+validation.`);
  }

  const now = new Date().toISOString();
  const { error } = await client.from("member_projects").update({
    ...parsed.data,
    cover_image_path: coverPath,
    updated_at: now,
    completed_at: parsed.data.project_status === "completed" ? (before.project_status === "completed" ? undefined : now) : null,
  }).eq("id", id.data);
  if (error) {
    if (newCoverPath) await removeProjectImages([newCoverPath]);
    redirect(`${workbenchPath(id.data)}?error=The+project+could+not+be+updated.`);
  }
  if (newCoverPath && before.cover_image_path && before.cover_image_path !== newCoverPath) await removeProjectImages([String(before.cover_image_path)]);
  revalidatePath("/dashboard");
  revalidatePath(workbenchPath());
  revalidatePath(workbenchPath(id.data));
  redirect(`${workbenchPath(id.data)}?notice=project-updated`);
}

export async function addProjectUpdate(formData: FormData) {
  const { user } = await requireUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  const destination = workbenchPath(String(formData.get("project_id") || ""));
  if (!parsed.success) redirect(`${destination}?error=Please+check+the+progress+update.`);
  if (!await consumeRateLimit("project-update", 20, 60 * 60, user.id)) redirect(`${destination}?error=Too+many+updates+have+been+posted.+Please+try+again+later.`);
  const client = createServiceClient();
  const { data: project } = await client.from("member_projects").select("id,owner_id").eq("id", parsed.data.project_id).is("archived_at", null).maybeSingle();
  if (!project) redirect(`${workbenchPath()}?error=Project+not+found.`);
  if (project.owner_id !== user.id) redirect(`${destination}?error=Only+the+project+owner+can+post+progress.`);
  const uploads = quarantinePaths(formData, 5);
  if (formData.getAll("quarantine_path").length > 5) redirect(`${destination}?error=Add+no+more+than+five+photographs.`);
  const finalized: string[] = [];
  try {
    for (const path of uploads) finalized.push((await finalizeQuarantinedUpload("project-image", path, user.id)).path);
  } catch {
    await removeProjectImages(finalized);
    redirect(`${destination}?error=One+of+the+photographs+failed+security+validation.`);
  }

  const { data: update, error } = await client.from("member_project_updates").insert({
    project_id: parsed.data.project_id,
    author_id: user.id,
    title: parsed.data.title,
    body: parsed.data.body,
    help_type: parsed.data.help_type || null,
  }).select("id").single();
  if (error || !update) {
    await removeProjectImages(finalized);
    redirect(`${destination}?error=The+progress+update+could+not+be+posted.`);
  }
  if (finalized.length) {
    const { error: photoError } = await client.from("member_project_photos").insert(finalized.map((storagePath, index) => ({
      update_id: update.id,
      storage_path: storagePath,
      sort_order: index,
    })));
    if (photoError) {
      await client.from("member_project_updates").delete().eq("id", update.id);
      await removeProjectImages(finalized);
      redirect(`${destination}?error=The+progress+photographs+could+not+be+saved.`);
    }
  }
  await client.from("member_projects").update({ updated_at: new Date().toISOString() }).eq("id", parsed.data.project_id);
  revalidatePath("/dashboard");
  revalidatePath(workbenchPath());
  revalidatePath(destination);
  redirect(`${destination}?notice=progress-posted#project-timeline`);
}

export async function addProjectComment(formData: FormData) {
  const { user } = await requireUser();
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  const destination = workbenchPath(String(formData.get("project_id") || ""));
  if (!parsed.success) redirect(`${destination}?error=Enter+a+comment+between+2+and+1,500+characters.`);
  if (!await consumeRateLimit("project-comment", 30, 60 * 60, user.id)) redirect(`${destination}?error=Too+many+comments+have+been+posted.+Please+try+again+later.`);
  const client = createServiceClient();
  const { data: project } = await client.from("member_projects").select("id").eq("id", parsed.data.project_id).is("archived_at", null).maybeSingle();
  if (!project) redirect(`${workbenchPath()}?error=Project+not+found.`);
  const { error } = await client.from("member_project_comments").insert({ project_id: parsed.data.project_id, author_id: user.id, body: parsed.data.body });
  if (error) redirect(`${destination}?error=The+comment+could+not+be+posted.`);
  revalidatePath(destination);
  revalidatePath(workbenchPath());
  redirect(`${destination}?notice=comment-posted#project-discussion`);
}

export async function toggleProjectFollow(formData: FormData) {
  const { user } = await requireUser();
  const id = projectId.safeParse(formData.get("project_id"));
  if (!id.success) redirect(`${workbenchPath()}?error=Project+not+found.`);
  const client = createServiceClient();
  const { data: existing } = await client.from("member_project_follows").select("project_id").eq("project_id", id.data).eq("user_id", user.id).maybeSingle();
  const result = existing
    ? await client.from("member_project_follows").delete().eq("project_id", id.data).eq("user_id", user.id)
    : await client.from("member_project_follows").insert({ project_id: id.data, user_id: user.id });
  if (result.error) redirect(`${workbenchPath(id.data)}?error=The+follow+setting+could+not+be+changed.`);
  revalidatePath(workbenchPath());
  revalidatePath(workbenchPath(id.data));
}

export async function archiveProject(formData: FormData) {
  const { user, role } = await requireUser();
  const id = projectId.safeParse(formData.get("project_id"));
  if (!id.success) redirect(`${workbenchPath()}?error=Project+not+found.`);
  const client = createServiceClient();
  const { data: project } = await client.from("member_projects").select("owner_id").eq("id", id.data).is("archived_at", null).maybeSingle();
  if (!project) redirect(`${workbenchPath()}?error=Project+not+found.`);
  if (project.owner_id !== user.id && !canManageContent(role)) redirect(`${workbenchPath(id.data)}?error=You+cannot+archive+this+project.`);
  const { error } = await client.from("member_projects").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id.data);
  if (error) redirect(`${workbenchPath(id.data)}?error=The+project+could+not+be+archived.`);
  revalidatePath("/dashboard");
  revalidatePath(workbenchPath());
  redirect(`${workbenchPath()}?notice=project-archived`);
}

export async function archiveProjectComment(formData: FormData) {
  const { user, role } = await requireUser();
  const commentId = z.string().uuid().safeParse(formData.get("comment_id"));
  const id = projectId.safeParse(formData.get("project_id"));
  if (!commentId.success || !id.success) redirect(workbenchPath());
  const client = createServiceClient();
  const { data: comment } = await client.from("member_project_comments").select("author_id").eq("id", commentId.data).eq("project_id", id.data).is("archived_at", null).maybeSingle();
  if (!comment) redirect(`${workbenchPath(id.data)}?error=Comment+not+found.`);
  if (comment.author_id !== user.id && !canManageContent(role)) redirect(`${workbenchPath(id.data)}?error=You+cannot+remove+this+comment.`);
  const { error } = await client.from("member_project_comments").update({ archived_at: new Date().toISOString(), archived_by: user.id }).eq("id", commentId.data);
  if (error) redirect(`${workbenchPath(id.data)}?error=The+comment+could+not+be+removed.`);
  revalidatePath(workbenchPath());
  revalidatePath(workbenchPath(id.data));
}
