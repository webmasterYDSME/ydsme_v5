"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  applyMemberListImport,
  buildMemberListPreview,
  MemberImportError,
  type MemberImportPreview,
  type MemberImportResult,
} from "@/lib/membermojo";
import { MEMBER_LIST_MAX_BYTES, MemberListError } from "@/lib/membermojo-list";
import { createServiceClient } from "@/lib/supabase/admin";

export type MemberImportPreviewState = { status: "idle" | "error" | "success"; message?: string; preview?: MemberImportPreview };
export type MemberImportApplyState = { status: "idle" | "error" | "success"; message?: string; result?: MemberImportResult };
export type MemberInvitationState = { status: "idle" | "error" | "success"; message?: string };

export async function previewMemberList(_previous: MemberImportPreviewState, formData: FormData): Promise<MemberImportPreviewState> {
  const { user } = await requireRole(["administrator"]);
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose the member-list CSV file downloaded from MemberMojo." };
  }
  if (!file.size || file.size > MEMBER_LIST_MAX_BYTES) {
    return { status: "error", message: "This file is empty or too large. Choose a MemberMojo file with no more than 1,000 people." };
  }
  if (!await consumeRateLimit("membermojo-import-preview", 20, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait before checking another file." };
  }
  try {
    const preview = await buildMemberListPreview(new Uint8Array(await file.arrayBuffer()));
    return { status: "success", message: "The check is ready. Nothing has been saved yet.", preview };
  } catch (error) {
    if (error instanceof MemberListError || error instanceof MemberImportError) return { status: "error", message: error.message };
    console.error("MemberMojo list check failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "We could not check this file. Please download a fresh copy from MemberMojo and try again." };
  }
}

export async function applyMemberList(_previous: MemberImportApplyState, formData: FormData): Promise<MemberImportApplyState> {
  const { user } = await requireRole(["administrator"]);
  const details = z.object({ fileSha256: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal("yes") })
    .safeParse({ fileSha256: formData.get("fileSha256"), confirmed: formData.get("confirmed") });
  const file = formData.get("file");
  if (!details.success) return { status: "error", message: "Tick the box to confirm." };
  if (!(file instanceof File) || !file.size || file.size > MEMBER_LIST_MAX_BYTES) {
    return { status: "error", message: "Choose the same MemberMojo file that you checked above." };
  }
  if (!await consumeRateLimit("membermojo-import-apply", 6, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait before saving again." };
  }
  try {
    const result = await applyMemberListImport(user.id, new Uint8Array(await file.arrayBuffer()), details.data.fileSha256);
    revalidatePath("/administrator/member-import");
    revalidatePath("/admin/members");
    return { status: "success", message: "The member list was saved.", result };
  } catch (error) {
    if (error instanceof MemberListError || error instanceof MemberImportError) return { status: "error", message: error.message };
    console.error("MemberMojo list save failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "We could not save the member list. Nothing was changed." };
  }
}

/**
 * Starts the background run. A scheduled job then sends a few invitations every five minutes, retries failures,
 * waits when Supabase Auth's hourly email limit is reached, and stops by itself when everyone has been invited.
 */
export async function startMemberInvitations(): Promise<MemberInvitationState> {
  const { user } = await requireRole(["administrator"]);
  if (!await consumeRateLimit("membermojo-invitations", 20, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait a little before trying again." };
  }
  const { data, error } = await createServiceClient().rpc("start_member_invitations", { p_actor_id: user.id });
  if (error || !data) {
    console.error("Starting website invitations failed", { error: error?.message ?? "unknown" });
    return { status: "error", message: "We could not start the invitations. Please try again." };
  }
  revalidatePath("/administrator/member-import");
  return { status: "success", message: "The invitations have started. The first ones go out within five minutes." };
}

/** Stops the background run. Nobody is invited twice, and starting again carries on with the people not yet invited. */
export async function pauseMemberInvitations(): Promise<MemberInvitationState> {
  const { user } = await requireRole(["administrator"]);
  const { error } = await createServiceClient().rpc("pause_member_invitations", { p_actor_id: user.id });
  if (error) {
    console.error("Pausing website invitations failed", { error: error.message });
    return { status: "error", message: "We could not pause the invitations. Please try again." };
  }
  revalidatePath("/administrator/member-import");
  return { status: "success", message: "The invitations are paused. Nothing more will be sent until you start them again." };
}
