"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  applyMemberMojoMembershipImport,
  buildMemberMojoPreview,
  MemberMojoImportApplyError,
  memberImportModes,
  type MemberImportPreview,
} from "@/lib/membermojo";
import { MemberMojoCsvError, MEMBERMOJO_MAX_FILE_BYTES } from "@/lib/membermojo-csv";

export type MemberImportActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  preview?: MemberImportPreview;
};

export type MemberImportApplyActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  processedCount?: number;
  createdCount?: number;
  refreshedCount?: number;
};

const modeSchema = z.enum(memberImportModes);

export async function previewMemberMojoImport(
  _previousState: MemberImportActionState,
  formData: FormData,
): Promise<MemberImportActionState> {
  const { user } = await requireCapability("members.manage");
  const mode = modeSchema.safeParse(formData.get("mode"));
  const file = formData.get("file");
  if (!mode.success) return { status: "error", message: "Choose a valid import mode." };
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose a MemberMojo CSV file." };
  }
  if (!file.size || file.size > MEMBERMOJO_MAX_FILE_BYTES) {
    return { status: "error", message: "The MemberMojo CSV must be non-empty and smaller than 750 KB." };
  }
  if (!await consumeRateLimit("membermojo-import-preview", 12, 60 * 60, user.id)) {
    return { status: "error", message: "Too many import previews. Wait before trying again." };
  }

  try {
    const preview = await buildMemberMojoPreview(new Uint8Array(await file.arrayBuffer()), mode.data, user.id);
    return {
      status: "success",
      message: "Preview complete. No membership record or portal account has been changed.",
      preview,
    };
  } catch (error) {
    if (error instanceof MemberMojoCsvError) return { status: "error", message: error.message };
    console.error("MemberMojo preview failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "The file could not be compared. Please try again." };
  }
}

const applySchema = z.object({
  importId: z.string().uuid(),
  confirmation: z.literal("APPLY MEMBERMOJO IMPORT"),
  reviewed: z.literal("yes"),
});

export async function applyMemberMojoImport(
  _previousState: MemberImportApplyActionState,
  formData: FormData,
): Promise<MemberImportApplyActionState> {
  const { user } = await requireCapability("members.manage");
  const confirmation = applySchema.safeParse({
    importId: formData.get("importId"),
    confirmation: formData.get("confirmation"),
    reviewed: formData.get("reviewed"),
  });
  const file = formData.get("file");
  if (!confirmation.success) {
    return { status: "error", message: "Review the exceptions and enter the exact confirmation phrase." };
  }
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose the same MemberMojo CSV used for this preview." };
  }
  if (!file.size || file.size > MEMBERMOJO_MAX_FILE_BYTES) {
    return { status: "error", message: "The MemberMojo CSV must be non-empty and smaller than 750 KB." };
  }
  if (!await consumeRateLimit("membermojo-import-apply", 6, 60 * 60, user.id)) {
    return { status: "error", message: "Too many import attempts. Wait before trying again." };
  }

  try {
    const result = await applyMemberMojoMembershipImport(
      new Uint8Array(await file.arrayBuffer()),
      confirmation.data.importId,
      user.id,
    );
    revalidatePath("/administrator/member-import");
    revalidatePath("/admin/members");
    return {
      status: "success",
      message: "Membership records were imported. Portal accounts, Auth emails and website roles were unchanged.",
      ...result,
    };
  } catch (error) {
    if (error instanceof MemberMojoCsvError || error instanceof MemberMojoImportApplyError) {
      return { status: "error", message: error.message };
    }
    console.error("MemberMojo apply failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "The import could not be applied. No membership records were changed." };
  }
}
