import "server-only";

import { createClient } from "@/lib/supabase/server";

export const projectCategories = [
  "locomotive",
  "rolling-stock",
  "railway",
  "workshop-tooling",
  "woodworking",
  "electronics",
  "3d-printing",
  "site-improvement",
  "other",
] as const;

export const projectStatuses = ["planning", "in-progress", "paused", "completed"] as const;

export const projectHelpTypes = [
  "advice",
  "tool-or-equipment",
  "material",
  "extra-pair-of-hands",
  "drawing-or-reference",
  "specialist-skill",
  "part-identification",
] as const;

export type ProjectCategory = (typeof projectCategories)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectHelpType = (typeof projectHelpTypes)[number];

export const categoryLabels: Record<ProjectCategory, string> = {
  locomotive: "Locomotive",
  "rolling-stock": "Rolling stock",
  railway: "Railway",
  "workshop-tooling": "Workshop tooling",
  woodworking: "Woodworking",
  electronics: "Electronics",
  "3d-printing": "3D printing",
  "site-improvement": "Site improvement",
  other: "Other",
};

export const statusLabels: Record<ProjectStatus, string> = {
  planning: "Planning",
  "in-progress": "In progress",
  paused: "Paused",
  completed: "Completed",
};

export const helpLabels: Record<ProjectHelpType, string> = {
  advice: "Advice needed",
  "tool-or-equipment": "Tool or equipment needed",
  material: "Material wanted",
  "extra-pair-of-hands": "Extra pair of hands",
  "drawing-or-reference": "Drawing or reference needed",
  "specialist-skill": "Specialist skill needed",
  "part-identification": "Part identification",
};

type ProjectRow = {
  id: string;
  owner_id: string | null;
  title: string;
  summary: string;
  category: ProjectCategory;
  project_status: ProjectStatus;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

type UpdateRow = {
  id: string;
  project_id: string;
  author_id: string | null;
  title: string;
  body: string;
  help_type: ProjectHelpType | null;
  created_at: string;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  update_id: string;
  storage_path: string;
  caption: string;
  sort_order: number;
  created_at: string;
};

type CommentRow = {
  id: string;
  project_id: string;
  update_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
};

type UserRow = { id: string; full_name: string | null };

type WorkbenchClient = Awaited<ReturnType<typeof createClient>>;

function memberAttribution(userId: string | null, names: Map<string, string>) {
  return userId ? names.get(userId) ?? "Society member" : "Former member";
}

async function signedProjectImages(client: WorkbenchClient, paths: Array<string | null | undefined>) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!uniquePaths.length) return new Map<string, string>();
  const { data, error } = await client.storage.from("project-images").createSignedUrls(uniquePaths, 60 * 60);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).flatMap((item) => item.signedUrl && item.path ? [[item.path, item.signedUrl] as const] : []));
}

export type WorkbenchProjectCard = ProjectRow & {
  owner_name: string;
  cover_image_url: string | null;
  update_count: number;
  comment_count: number;
  follower_count: number;
  latest_update: Pick<UpdateRow, "title" | "created_at" | "help_type"> | null;
  followed_by_me: boolean;
};

export async function getWorkbenchProjects({
  userId,
  category,
  status,
  scope,
  helpOnly = false,
  limit = 60,
}: {
  userId: string;
  category?: ProjectCategory;
  status?: ProjectStatus;
  scope?: "mine" | "following";
  helpOnly?: boolean;
  limit?: number;
}) {
  const client = await createClient();
  let eligibleProjectIds: string[] | null = null;

  if (scope === "following") {
    const { data, error } = await client.from("member_project_follows").select("project_id").eq("user_id", userId);
    if (error) throw new Error("Unable to load followed projects.");
    eligibleProjectIds = (data ?? []).map((row) => String(row.project_id));
    if (!eligibleProjectIds.length) return [] as WorkbenchProjectCard[];
  }

  if (helpOnly) {
    const { data, error } = await client.from("member_project_updates").select("project_id").not("help_type", "is", null);
    if (error) throw new Error("Unable to load project help requests.");
    const helpIds = [...new Set((data ?? []).map((row) => String(row.project_id)))];
    eligibleProjectIds = eligibleProjectIds ? eligibleProjectIds.filter((id) => helpIds.includes(id)) : helpIds;
    if (!eligibleProjectIds.length) return [] as WorkbenchProjectCard[];
  }

  let query = client.from("member_projects")
    .select("id,owner_id,title,summary,category,project_status,cover_image_path,created_at,updated_at,completed_at,archived_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("project_status", status);
  if (scope === "mine") query = query.eq("owner_id", userId);
  if (eligibleProjectIds) query = query.in("id", eligibleProjectIds);

  const { data, error } = await query;
  if (error) throw new Error("Unable to load Project Workbench.");
  const projects = (data ?? []) as ProjectRow[];
  if (!projects.length) return [] as WorkbenchProjectCard[];
  const ids = projects.map((project) => project.id);
  const ownerIds = [...new Set(projects.map((project) => project.owner_id).filter((id): id is string => Boolean(id)))];
  const [usersResult, updatesResult, commentsResult, followsResult, imageUrls] = await Promise.all([
    client.rpc("workbench_member_names", { p_user_ids: ownerIds }),
    client.from("member_project_updates").select("id,project_id,title,created_at,help_type").in("project_id", ids).order("created_at", { ascending: false }),
    client.from("member_project_comments").select("project_id").in("project_id", ids).is("archived_at", null),
    client.from("member_project_follows").select("project_id,user_id").in("project_id", ids),
    signedProjectImages(client, projects.map((project) => project.cover_image_path)),
  ]);
  if (usersResult.error || updatesResult.error || commentsResult.error || followsResult.error) throw new Error("Unable to prepare Project Workbench.");
  const owners = new Map(((usersResult.data ?? []) as UserRow[]).map((user) => [user.id, user.full_name || "Society member"]));
  const updates = (updatesResult.data ?? []) as Array<Pick<UpdateRow, "id" | "project_id" | "title" | "created_at" | "help_type">>;
  const comments = commentsResult.data ?? [];
  const follows = followsResult.data ?? [];

  return projects.map((project) => {
    const projectUpdates = updates.filter((update) => update.project_id === project.id);
    const projectFollows = follows.filter((follow) => follow.project_id === project.id);
    const latest = projectUpdates[0];
    return {
      ...project,
      owner_name: memberAttribution(project.owner_id, owners),
      cover_image_url: project.cover_image_path ? imageUrls.get(project.cover_image_path) ?? null : null,
      update_count: projectUpdates.length,
      comment_count: comments.filter((comment) => comment.project_id === project.id).length,
      follower_count: projectFollows.length,
      latest_update: latest ? { title: latest.title, created_at: latest.created_at, help_type: latest.help_type } : null,
      followed_by_me: projectFollows.some((follow) => follow.user_id === userId),
    };
  });
}

export type WorkbenchProjectDetail = ProjectRow & {
  owner_name: string;
  cover_image_url: string | null;
  followed_by_me: boolean;
  follower_count: number;
  updates: Array<UpdateRow & { photos: Array<PhotoRow & { image_url: string | null }> }>;
  comments: Array<CommentRow & { author_name: string }>;
};

export async function getWorkbenchProject(projectId: string, userId: string): Promise<WorkbenchProjectDetail | null> {
  const client = await createClient();
  const { data, error } = await client.from("member_projects")
    .select("id,owner_id,title,summary,category,project_status,cover_image_path,created_at,updated_at,completed_at,archived_at")
    .eq("id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("Unable to load the project.");
  if (!data) return null;
  const project = data as ProjectRow;
  const [updatesResult, commentsResult, followsResult] = await Promise.all([
    client.from("member_project_updates").select("id,project_id,author_id,title,body,help_type,created_at,updated_at").eq("project_id", project.id).order("created_at", { ascending: false }),
    client.from("member_project_comments").select("id,project_id,update_id,author_id,body,created_at").eq("project_id", project.id).is("archived_at", null).order("created_at"),
    client.from("member_project_follows").select("project_id,user_id").eq("project_id", project.id),
  ]);
  if (updatesResult.error || commentsResult.error || followsResult.error) throw new Error("Unable to prepare the project.");
  const updates = (updatesResult.data ?? []) as UpdateRow[];
  const updateIds = updates.map((update) => update.id);
  const { data: photoData, error: photoError } = updateIds.length
    ? await client.from("member_project_photos").select("id,update_id,storage_path,caption,sort_order,created_at").in("update_id", updateIds).order("sort_order")
    : { data: [], error: null };
  if (photoError) throw new Error("Unable to load project photographs.");
  const photos = (photoData ?? []) as PhotoRow[];
  const comments = (commentsResult.data ?? []) as CommentRow[];
  const authorIds = [...new Set(
    [project.owner_id, ...comments.map((comment) => comment.author_id)].filter((id): id is string => Boolean(id)),
  )];
  const { data: authorData, error: authorError } = await client.rpc("workbench_member_names", { p_user_ids: authorIds });
  if (authorError) throw new Error("Unable to load project contributors.");
  const authors = new Map(((authorData ?? []) as UserRow[]).map((author) => [author.id, author.full_name || "Society member"]));
  const imageUrls = await signedProjectImages(client, [project.cover_image_path, ...photos.map((photo) => photo.storage_path)]);
  const follows = followsResult.data ?? [];

  return {
    ...project,
    owner_name: memberAttribution(project.owner_id, authors),
    cover_image_url: project.cover_image_path ? imageUrls.get(project.cover_image_path) ?? null : null,
    followed_by_me: follows.some((follow) => follow.user_id === userId),
    follower_count: follows.length,
    updates: updates.map((update) => ({
      ...update,
      photos: photos.filter((photo) => photo.update_id === update.id).map((photo) => ({ ...photo, image_url: imageUrls.get(photo.storage_path) ?? null })),
    })),
    comments: comments.map((comment) => ({ ...comment, author_name: memberAttribution(comment.author_id, authors) })),
  };
}
