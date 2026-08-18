"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildMemberMojoPreview, memberImportModes, type MemberImportPreview } from "@/lib/membermojo";
import { MemberMojoCsvError, MEMBERMOJO_MAX_FILE_BYTES } from "@/lib/membermojo-csv";

export type MemberImportActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  preview?: MemberImportPreview;
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
    const preview = await buildMemberMojoPreview(new Uint8Array(await file.arrayBuffer()), mode.data);
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
