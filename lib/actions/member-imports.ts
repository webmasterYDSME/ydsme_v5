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
import { membershipBillingEnabled } from "@/lib/features";

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
  if (membershipBillingEnabled()) return { status: "error", message: "The final MemberMojo migration is complete. Use the website membership register." };
  const { user } = await requireCapability("members.manage");
  const mode = modeSchema.safeParse(formData.get("mode"));
  const file = formData.get("file");
  if (!mode.success) return { status: "error", message: "Choose whether this file contains some members or every current member." };
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose the member-list CSV file downloaded from MemberMojo." };
  }
  if (!file.size || file.size > MEMBERMOJO_MAX_FILE_BYTES) {
    return { status: "error", message: "This file is empty or too large. Choose a MemberMojo file with no more than 1,000 people." };
  }
  if (!await consumeRateLimit("membermojo-import-preview", 12, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait before checking another file." };
  }

  try {
    const preview = await buildMemberMojoPreview(new Uint8Array(await file.arrayBuffer()), mode.data, user.id);
    return {
      status: "success",
      message: "The check is ready. Nothing has been changed or saved yet.",
      preview,
    };
  } catch (error) {
    if (error instanceof MemberMojoCsvError) return { status: "error", message: error.message };
    console.error("MemberMojo preview failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "We could not check this file. Please download a fresh copy from MemberMojo and try again." };
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
  if (membershipBillingEnabled()) return { status: "error", message: "The final MemberMojo migration is complete. Further imports are disabled." };
  const { user } = await requireCapability("members.manage");
  const confirmation = applySchema.safeParse({
    importId: formData.get("importId"),
    confirmation: formData.get("confirmation"),
    reviewed: formData.get("reviewed"),
  });
  const file = formData.get("file");
  if (!confirmation.success) {
    return { status: "error", message: "Check the warnings, tick the box, and type the words exactly as shown." };
  }
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose the same MemberMojo file that you checked above." };
  }
  if (!file.size || file.size > MEMBERMOJO_MAX_FILE_BYTES) {
    return { status: "error", message: "This file is empty or too large. Choose the same MemberMojo file you checked above." };
  }
  if (!await consumeRateLimit("membermojo-import-apply", 6, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait before saving again." };
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
      message: "The member list was updated. Nobody’s sign-in, login email, or website access level was changed.",
      ...result,
    };
  } catch (error) {
    if (error instanceof MemberMojoCsvError || error instanceof MemberMojoImportApplyError) {
      return { status: "error", message: error.message };
    }
    console.error("MemberMojo apply failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "We could not save the member changes. Nothing was changed." };
  }
}

const portalReviewSchema = z.object({
  membershipRecordId: z.string().uuid(),
  decision: z.enum(["archive_access", "retain_access"]),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.string().trim().max(100),
});

function portalReviewError(message: string) {
  if (message.includes("membermojo_portal_review_self")) return "You cannot turn off your own sign-in.";
  if (message.includes("membermojo_portal_review_administrator")) return "Change this administrator to a normal member before turning off sign-in.";
  if (message.includes("membermojo_portal_review_unavailable")) return "This check has already been completed or is no longer available.";
  return "We could not save your choice. Please try again.";
}

export async function resolveMemberMojoPortalAccessReview(formData: FormData) {
  if (membershipBillingEnabled()) redirect("/admin/memberships");
  const { user } = await requireCapability("members.manage");
  const parsed = portalReviewSchema.safeParse({
    membershipRecordId: formData.get("membershipRecordId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) redirect("/administrator/member-import?error=Write+a+short+reason+and+type+the+words+exactly+as+shown.");
  const expectedConfirmation = parsed.data.decision === "archive_access" ? "ARCHIVE PORTAL ACCESS" : "RETAIN PORTAL ACCESS";
  if (parsed.data.confirmation !== expectedConfirmation) {
    redirect("/administrator/member-import?error=The+words+you+typed+do+not+match+the+highlighted+words.");
  }
  if (!await consumeRateLimit("membermojo-portal-review", 30, 60 * 60, user.id)) {
    redirect("/administrator/member-import?error=You+have+saved+many+choices+in+a+short+time.+Please+wait+before+trying+again.");
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
