"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
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
  endedCount?: number;
  restoredCount?: number;
  portalAccessReviewCount?: number;
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

const portalReviewSchema = z.object({
  membershipRecordId: z.string().uuid(),
  decision: z.enum(["archive_access", "retain_access"]),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.string().trim().max(100),
});

function portalReviewError(message: string) {
  if (message.includes("membermojo_portal_review_self")) return "You cannot archive your own portal access.";
  if (message.includes("membermojo_portal_review_administrator")) return "Demote the administrator account before archiving its access.";
  if (message.includes("membermojo_portal_review_unavailable")) return "That portal-access review is no longer available.";
  return "The portal-access review could not be saved.";
}

export async function resolveMemberMojoPortalAccessReview(formData: FormData) {
  const { user } = await requireCapability("members.manage");
  const parsed = portalReviewSchema.safeParse({
    membershipRecordId: formData.get("membershipRecordId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) redirect("/administrator/member-import?error=Enter+a+review+reason+and+the+exact+confirmation+phrase.");
  const expectedConfirmation = parsed.data.decision === "archive_access" ? "ARCHIVE PORTAL ACCESS" : "RETAIN PORTAL ACCESS";
  if (parsed.data.confirmation !== expectedConfirmation) {
    redirect("/administrator/member-import?error=The+typed+confirmation+did+not+match.");
  }
  if (!await consumeRateLimit("membermojo-portal-review", 30, 60 * 60, user.id)) {
    redirect("/administrator/member-import?error=Too+many+portal-access+reviews.+Wait+before+trying+again.");
  }

  const { data, error } = await createAdminClient().rpc("resolve_membermojo_portal_access_review", {
    p_actor_id: user.id,
    p_decision: parsed.data.decision,
    p_membership_record_id: parsed.data.membershipRecordId,
    p_reason: parsed.data.reason,
  });
  if (error || !data?.[0]) {
    redirect(`/administrator/member-import?error=${encodeURIComponent(portalReviewError(error?.message ?? "missing result"))}`);
  }
  revalidatePath("/administrator/member-import");
  revalidatePath("/admin/members");
  const notice = parsed.data.decision === "archive_access" ? "portal-access-archived" : "portal-access-retained";
  redirect(`/administrator/member-import?notice=${notice}`);
}
