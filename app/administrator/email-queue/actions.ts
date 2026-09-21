"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, type AppRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkQueueSettings } from "@/lib/email-queue-format";

const PAGE = "/administrator/email-queue";

/** Only administrators may touch the queue; the layout also checks, but every action asks again. */
async function administrator() {
  const { user, role } = await requireRole(["administrator"]);
  return { user, role, admin: createServiceClient() };
}

function done(notice: string, count?: number): never {
  revalidatePath(PAGE);
  revalidatePath("/admin/memberships", "layout");
  redirect(`${PAGE}?notice=${notice}${count === undefined ? "" : `&n=${count}`}`);
}

async function record(actor: { user: { id: string }; role: AppRole }, action: string, summary: string) {
  await writeAudit({
    actorUserId: actor.user.id, actorRole: actor.role, action: `email-queue.${action}`,
    entityType: "email-queue", entityId: "settings", summary,
  });
}

/** The buttons on the list: put the ticked emails (or one row) back in the queue, or stop them. */
export async function changeQueuedEmails(form: FormData) {
  const actor = await administrator();
  const intent = z.string().max(80).parse(form.get("intent"));
  const [verb, single] = intent.split(":");
  if (verb !== "requeue" && verb !== "cancel") redirect(`${PAGE}?error=invalid`);
  const ids = single ? [single] : form.getAll("ids").map(String);
  const parsed = z.array(z.uuid()).max(200).safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) redirect(`${PAGE}?error=none-selected`);
  const rpc = verb === "requeue" ? "requeue_membership_notifications" : "cancel_queued_membership_notifications";
  const { data, error } = await actor.admin.rpc(rpc, { p_ids: parsed.data, p_scope: "ids" });
  if (error) redirect(`${PAGE}?error=failed`);
  const count = Number(data ?? 0);
  await record(actor, verb === "requeue" ? "requeued" : "stopped", `${count} email${count === 1 ? "" : "s"} ${verb === "requeue" ? "put back in the queue" : "stopped"}`);
  if (verb === "requeue") await actor.admin.rpc("request_membership_notification_delivery");
  done(verb === "requeue" ? "requeued" : "stopped", count);
}

export async function requeueFailedEmails() {
  const actor = await administrator();
  const { data, error } = await actor.admin.rpc("requeue_membership_notifications", { p_ids: null, p_scope: "failed" });
  if (error) redirect(`${PAGE}?error=failed`);
  const count = Number(data ?? 0);
  await record(actor, "requeued-failed", `${count} failed emails put back in the queue`);
  await actor.admin.rpc("request_membership_notification_delivery");
  done("requeued", count);
}

/** Stops every queued (bulk) email that has not gone yet, for example invitations sent by mistake. */
export async function stopWaitingBulkEmails() {
  const actor = await administrator();
  const { data, error } = await actor.admin.rpc("cancel_queued_membership_notifications", { p_ids: null, p_scope: "bulk" });
  if (error) redirect(`${PAGE}?error=failed`);
  const count = Number(data ?? 0);
  await record(actor, "bulk-stopped", `${count} waiting queued emails stopped`);
  done("stopped", count);
}

export async function setBulkPaused(form: FormData) {
  const actor = await administrator();
  const paused = form.get("paused") === "true";
  const { error } = await actor.admin.from("email_queue_settings")
    .update({ bulk_paused: paused, updated_at: new Date().toISOString(), updated_by: actor.user.id }).eq("id", true);
  if (error) redirect(`${PAGE}?error=failed`);
  await record(actor, paused ? "bulk-paused" : "bulk-resumed", paused ? "Queued email sending paused" : "Queued email sending resumed");
  done(paused ? "paused" : "resumed");
}

/** Forget a provider pause early, for example after the provider's allowance has been raised. */
export async function clearProviderPause() {
  const actor = await administrator();
  const { error } = await actor.admin.from("email_queue_settings")
    .update({ blocked_until: null, blocked_reason: null, updated_at: new Date().toISOString(), updated_by: actor.user.id }).eq("id", true);
  if (error) redirect(`${PAGE}?error=failed`);
  await record(actor, "provider-pause-cleared", "Email provider pause cleared");
  done("pause-cleared");
}

export async function saveQueueSettings(form: FormData) {
  const actor = await administrator();
  const checked = checkQueueSettings({
    dailyLimit: Number(form.get("daily_limit")),
    immediateReserve: Number(form.get("immediate_reserve")),
    bulkBatchSize: Number(form.get("bulk_batch_size")),
  });
  if (!checked.ok) redirect(`${PAGE}?error=settings-invalid`);
  const { error } = await actor.admin.from("email_queue_settings").update({
    daily_limit: checked.dailyLimit, immediate_reserve: checked.immediateReserve, bulk_batch_size: checked.bulkBatchSize,
    updated_at: new Date().toISOString(), updated_by: actor.user.id,
  }).eq("id", true);
  if (error) redirect(`${PAGE}?error=failed`);
  await record(actor, "settings-saved", `Daily limit ${checked.dailyLimit}, ${checked.immediateReserve} kept for immediate mail, ${checked.bulkBatchSize} queued emails at a time`);
  done("settings-saved");
}
