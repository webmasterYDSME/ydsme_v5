"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { likeLiteral } from "@/lib/like-literal";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  applyMemberListImport,
  buildMemberListPreview,
  countPendingInvitations,
  MemberImportError,
  type MemberImportPreview,
  type MemberImportResult,
} from "@/lib/membermojo";
import { MEMBER_LIST_MAX_BYTES, MEMBER_LIST_MAX_ROWS, MemberListError } from "@/lib/membermojo-list";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";

export type MemberImportPreviewState = { status: "idle" | "error" | "success"; message?: string; preview?: MemberImportPreview };
export type MemberImportApplyState = { status: "idle" | "error" | "success"; message?: string; result?: MemberImportResult };
export type MemberInvitationState = { status: "idle" | "error" | "success"; message?: string; sent?: number; linked?: number; failed?: number; remaining?: number };

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

const applySchema = z.object({
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({
    fullName: z.string().max(180),
    email: z.string().max(254),
    membershipType: z.string().max(120),
  })).min(1).max(MEMBER_LIST_MAX_ROWS),
  confirmed: z.literal("yes"),
});

export async function applyMemberList(_previous: MemberImportApplyState, formData: FormData): Promise<MemberImportApplyState> {
  const { user } = await requireRole(["administrator"]);
  let rows: unknown;
  try { rows = JSON.parse(String(formData.get("rows") ?? "")); } catch { rows = null; }
  const parsed = applySchema.safeParse({ fileSha256: formData.get("fileSha256"), rows, confirmed: formData.get("confirmed") });
  if (!parsed.success) return { status: "error", message: "Tick the box to confirm. If this keeps happening, check the file again." };
  if (!await consumeRateLimit("membermojo-import-apply", 6, 60 * 60, user.id)) {
    return { status: "error", message: "This has been tried several times. Please wait before saving again." };
  }
  try {
    const result = await applyMemberListImport(user.id, parsed.data.rows, parsed.data.fileSha256);
    revalidatePath("/administrator/member-import");
    revalidatePath("/admin/members");
    return { status: "success", message: "The member list was saved.", result };
  } catch (error) {
    if (error instanceof MemberImportError) return { status: "error", message: error.message };
    console.error("MemberMojo list save failed", { error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: "We could not save the member list. Nothing was changed." };
  }
}

const INVITATION_BATCH = 40;

/** Invites the next batch of imported members to the website. Safe to press again: it carries on where it stopped. */
export async function sendMemberInvitations(): Promise<MemberInvitationState> {
  const { user, role } = await requireRole(["administrator"]);
  if (!await consumeRateLimit("membermojo-invitations", 60, 60 * 60, user.id)) {
    return { status: "error", message: "Many invitations have been sent in a short time. Please wait before sending more." };
  }
  const admin = createServiceClient();
  const { data: members, error } = await admin.from("members")
    .select("id,full_name,contact_email")
    .eq("source", "membermojo_cutover").eq("portal_invitation_status", "eligible")
    .is("auth_user_id", null).eq("contact_role", "self").not("contact_email", "is", null).is("anonymized_at", null)
    .order("created_at").order("id").limit(INVITATION_BATCH);
  if (error) return { status: "error", message: "We could not read the list of people to invite." };

  const origin = getTrustedAppOrigin();
  let sent = 0;
  let linked = 0;
  let failed = 0;
  for (const member of members ?? []) {
    const email = String(member.contact_email).trim().toLowerCase();
    const { data: profiles, error: profileError } = await admin.from("users").select("id").ilike("email", likeLiteral(email)).limit(2);
    if (profileError) { failed += 1; continue; }
    let authUserId: string | null = null;
    let status: "sent" | "linked" | "blocked_shared" = "sent";
    if (profiles && profiles.length === 1) {
      const { data: owner } = await admin.from("members").select("id").eq("auth_user_id", profiles[0].id).neq("id", member.id).maybeSingle();
      authUserId = profiles[0].id as string;
      status = owner ? "blocked_shared" : "linked";
    } else if (profiles && profiles.length > 1) {
      status = "blocked_shared";
    } else {
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: member.full_name, membership_active: true },
        redirectTo: `${origin}/auth/invite?next=/reset-password`,
      });
      if (inviteError || !invitation.user) {
        failed += 1;
        if (inviteError?.status === 429) break;
        continue;
      }
      authUserId = invitation.user.id;
    }
    const { error: updateError } = await admin.from("members").update({
      auth_user_id: status === "blocked_shared" ? null : authUserId,
      portal_invitation_status: status,
      updated_at: new Date().toISOString(),
    }).eq("id", member.id).is("auth_user_id", null);
    if (updateError) { failed += 1; continue; }
    if (status === "sent") sent += 1;
    else if (status === "linked") linked += 1;
  }

  const remaining = await countPendingInvitations();
  if (sent || linked) {
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membermojo.invitations-sent", entityType: "member-import",
      entityId: crypto.randomUUID(), summary: `${sent} invited; ${linked} linked to an existing login; ${failed} failed`,
    });
  }
  revalidatePath("/administrator/member-import");
  revalidatePath("/admin/members");
  const message = failed
    ? `${sent} invited${linked ? `, ${linked} linked to an existing login` : ""}. ${failed} could not be sent; press the button again to retry.`
    : `${sent} invited${linked ? `, ${linked} linked to an existing login` : ""}.`;
  return { status: failed && !sent && !linked ? "error" : "success", message, sent, linked, failed, remaining };
}
