import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ProjectCategory, ProjectHelpType } from "@/lib/workbench";

type PublicProjectRow = {
  project_id: string;
  slug: string;
  title: string;
  summary: string;
  category: ProjectCategory;
  completed_at: string;
  owner_byline: string;
  cover_image_path: string | null;
  published_at: string;
};

type PublicUpdateRow = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  help_type: ProjectHelpType | null;
  created_at: string;
  sort_order: number;
};

type PublicPhotoRow = {
  id: string;
  update_id: string;
  storage_path: string;
  caption: string;
  sort_order: number;
};

async function signedPublicProjectImages(paths: Array<string | null | undefined>) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!uniquePaths.length) return new Map<string, string>();

  // Only paths already present in the sanitised public projection reach this
  // storage-only elevated call. Original member photographs are never signed.
  const { data, error } = await createAdminClient().storage
    .from("public-project-images")
    .createSignedUrls(uniquePaths, 5 * 60);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).flatMap((item) => item.path && item.signedUrl
    ? [[item.path, item.signedUrl] as const]
    : []));
}

export type PublicFeaturedProjectCard = PublicProjectRow & {
  cover_image_url: string | null;
};

export const getPublicFeaturedProjects = cache(async (limit = 24): Promise<PublicFeaturedProjectCard[]> => {
  const client = await createClient();
  const { data, error } = await client.from("public_featured_projects")
    .select("project_id,slug,title,summary,category,completed_at,owner_byline,cover_image_path,published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Unable to load featured projects.");

  const projects = (data ?? []) as PublicProjectRow[];
  const images = await signedPublicProjectImages(projects.map((project) => project.cover_image_path));
  return projects.map((project) => ({
    ...project,
    cover_image_url: project.cover_image_path ? images.get(project.cover_image_path) ?? null : null,
  }));
});

export type PublicFeaturedProject = PublicProjectRow & {
  cover_image_url: string | null;
  updates: Array<PublicUpdateRow & {
    photos: Array<PublicPhotoRow & { image_url: string | null }>;
  }>;
};

export const getPublicFeaturedProject = cache(async (slug: string): Promise<PublicFeaturedProject | null> => {
  const client = await createClient();
  const { data, error } = await client.from("public_featured_projects")
    .select("project_id,slug,title,summary,category,completed_at,owner_byline,cover_image_path,published_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("Unable to load the featured project.");
  if (!data) return null;

  const project = data as PublicProjectRow;
  const { data: updateData, error: updateError } = await client.from("public_featured_project_updates")
    .select("id,project_id,title,body,help_type,created_at,sort_order")
    .eq("project_id", project.project_id)
    .order("sort_order");
  if (updateError) throw new Error("Unable to load the public project story.");

  const updates = (updateData ?? []) as PublicUpdateRow[];
  const updateIds = updates.map((update) => update.id);
  const { data: photoData, error: photoError } = updateIds.length
    ? await client.from("public_featured_project_photos")
      .select("id,update_id,storage_path,caption,sort_order")
      .in("update_id", updateIds)
      .order("sort_order")
    : { data: [], error: null };
  if (photoError) throw new Error("Unable to load public project photographs.");

  const photos = (photoData ?? []) as PublicPhotoRow[];
  const images = await signedPublicProjectImages([
    project.cover_image_path,
    ...photos.map((photo) => photo.storage_path),
  ]);

  return {
    ...project,
    cover_image_url: project.cover_image_path ? images.get(project.cover_image_path) ?? null : null,
    updates: updates.map((update) => ({
      ...update,
      photos: photos
        .filter((photo) => photo.update_id === update.id)
        .map((photo) => ({ ...photo, image_url: images.get(photo.storage_path) ?? null })),
    })),
  };
});
