import { withSupabase } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type QuarantineBucket = "images" | "documents";
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const MAXIMUM_AGE_MS = 24 * 60 * 60 * 1000;

async function listAll(client: SupabaseClient, bucket: string, path: string) {
  const entries: Array<{ name: string; created_at?: string | null }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.storage.from(bucket).list(path, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Unable to list ${bucket}/${path}.`);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return entries;
  }
}

async function removeExpiredQuarantine(client: SupabaseClient, bucket: QuarantineBucket) {
  const owners = await listAll(client, bucket, "quarantine");
  const cutoff = Date.now() - MAXIMUM_AGE_MS;
  const expired: string[] = [];

  for (const owner of owners) {
    const files = await listAll(client, bucket, `quarantine/${owner.name}`);
    for (const file of files) {
      if (file.created_at && new Date(file.created_at).getTime() < cutoff) {
        expired.push(`quarantine/${owner.name}/${file.name}`);
      }
    }
  }

  for (let offset = 0; offset < expired.length; offset += DELETE_BATCH_SIZE) {
    const { error } = await client.storage.from(bucket).remove(expired.slice(offset, offset + DELETE_BATCH_SIZE));
    if (error) throw new Error(`Unable to remove expired ${bucket} uploads.`);
  }
  return expired.length;
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") return Response.json({ ok: false }, { status: 405, headers: { Allow: "POST" } });

    try {
      const [imageUploadsRemoved, documentUploadsRemoved] = await Promise.all([
        removeExpiredQuarantine(context.supabaseAdmin, "images"),
        removeExpiredQuarantine(context.supabaseAdmin, "documents"),
      ]);
      const result = { image_uploads_removed: imageUploadsRemoved, document_uploads_removed: documentUploadsRemoved };
      const occurredAt = new Date().toISOString();
      const auditRecord = {
        actor_user_id: null,
        actor_role: "system",
        action: "quarantine.cleanup.completed",
        entity_type: "retention-run",
        entity_id: occurredAt,
        after_state: result,
      };
      const { error } = await context.supabaseAdmin.from("audit_logs").insert(auditRecord as never);
      if (error) throw new Error("Unable to record quarantine cleanup.");
      return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Quarantine cleanup failed", error instanceof Error ? error.message : "Unknown error");
      return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  }),
};
