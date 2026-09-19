"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

const SETUP = "/admin/memberships/setup?tab=retention";

/**
 * Switches the automatic warning and removal of old member details on or off. Only an administrator can,
 * and only after saying they have checked the list, because once it is on people are warned by email and
 * their details are removed a month later.
 */
export async function setMembershipRetention(form: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const enable = form.get("enabled") === "true";
  if (enable && form.get("reviewed") !== "on") redirect(`${SETUP}&error=retention-confirm-required`);
  const admin = createServiceClient();
  const { error } = await admin.from("membership_retention_settings").update({
    enabled: enable,
    enabled_at: enable ? new Date().toISOString() : null,
    enabled_by: enable ? user.id : null,
  }).eq("singleton", true);
  if (error) redirect(`${SETUP}&error=retention-switch-failed`);
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: enable ? "membership.retention-switched-on" : "membership.retention-switched-off",
    entityType: "membership-retention", entityId: "schedule",
    summary: enable ? "Automatic warning and removal of old member details was switched on." : "Automatic warning and removal of old member details was switched off.",
  });
  revalidatePath("/admin/memberships", "layout");
  redirect(`${SETUP}&notice=${enable ? "retention-on" : "retention-off"}`);
}
