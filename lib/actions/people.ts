"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { finalizeQuarantinedUpload } from "@/lib/uploads";
import { storageObjectPath } from "@/lib/storage-path";
import { PUBLIC_COMMITTEE_CACHE_TAG } from "@/lib/cache-tags";

const schema = z.object({
  full_name: z.string().trim().min(2).max(180).optional(),
  expected_full_name: z.string().max(180).optional(),
  user_id: z.union([z.literal(""), z.string().uuid()]),
  role: z.enum(["member", "committee", "administrator"]),
  expected_role: z.enum(["member", "committee", "administrator"]),
  officer: z.boolean(), has_listing: z.boolean(),
  listing_id: z.number().int().positive().nullable(),
  listing_updated_at: z.string().nullable(),
  name: z.string().trim().max(180), title: z.string().trim().max(180),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  is_public: z.boolean(), position: z.number().int().min(0).max(9999),
});

export async function savePeople(formData: FormData) {
  const { user } = await requireRole(["administrator"]);
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData), user_id: formData.get("user_id") || "",
    listing_id: formData.get("listing_id") ? Number(formData.get("listing_id")) : null,
    listing_updated_at: formData.get("listing_updated_at") || null,
    officer: formData.get("officer") === "on", has_listing: formData.get("has_listing") === "on",
    is_public: formData.get("is_public") === "on", position: Number(formData.get("position") || 0),
  });
  if (!parsed.success) return { error: "Please check the access and committee listing details." };
  const input = parsed.data;
  if (input.full_name !== undefined && (!input.user_id || input.expected_full_name === undefined)) return { error: "Refresh the member details before changing their name." };
  if (input.has_listing && input.title.length < 2) return { error: "Enter a committee position." };
  if (!input.user_id && !input.has_listing) return { error: "Add a committee position before saving." };
  const admin = createServiceClient();
  // Never trust a hidden file URL supplied by the browser.
  const { data: listing, error: listingError } = input.listing_id
    ? await admin.from("committees").select("file_url").eq("id", input.listing_id).maybeSingle()
    : { data: null, error: null };
  if (listingError || (input.listing_id && !listing)) return { error: "The committee position could not be found." };
  let fileUrl = listing?.file_url || "";
  let uploadedPath: string | null = null;
  const quarantinePath = String(formData.get("quarantine_path") || "");
  if (input.has_listing && quarantinePath) {
    try {
      const uploaded = await finalizeQuarantinedUpload("committee-image", quarantinePath, user.id);
      fileUrl = uploaded.canonicalPath; uploadedPath = uploaded.path;
    } catch {
      return { error: "The portrait failed validation. Please choose the image again.", reselectFile: true };
    }
  }
  const { data, error } = await admin.rpc("save_people_management", {
    p_actor_id: user.id, p_input: { ...input, file_url: fileUrl },
  });
  if (error) {
    if (uploadedPath) await admin.storage.from("images").remove([uploadedPath]);
    const known = /^(Enter a valid full name|The name changed|Administrator access|Restore this account|Choose a valid role|The role changed|You cannot change your own role|At least two active administrators|Membership access can only|A linked committee listing|Choose a committee account|The committee position|The committee listing changed|Enter a committee position)/;
    return { error: known.test(error.message) ? error.message : "The changes could not be saved. Please try again.", reselectFile: Boolean(uploadedPath) };
  }
  if (uploadedPath) {
    const oldPath = storageObjectPath(data?.old_path, "images");
    if (oldPath && oldPath !== uploadedPath) await admin.storage.from("images").remove([oldPath]);
  }
  updateTag(PUBLIC_COMMITTEE_CACHE_TAG);
  revalidatePath("/committees"); revalidatePath("/admin/members");
  revalidatePath("/admin/people"); revalidatePath("/admin/memberships");
  revalidatePath("/account");
  revalidatePath("/dashboard", "layout");
  return { success: true };
}
