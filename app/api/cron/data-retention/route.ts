import { timingSafeEqual } from "node:crypto";
import { writeAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const configured = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || configured.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(provided));
}

async function removeExpiredQuarantine(bucket: "images" | "documents") {
  const admin = createAdminClient();
  const { data: owners } = await admin.storage.from(bucket).list("quarantine", { limit: 1000 });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const owner of owners ?? []) {
    const { data: files } = await admin.storage.from(bucket).list(`quarantine/${owner.name}`, { limit: 1000 });
    const expired = (files ?? []).filter(file => file.created_at && new Date(file.created_at).getTime() < cutoff).map(file => `quarantine/${owner.name}/${file.name}`);
    if (expired.length) {
      const { error } = await admin.storage.from(bucket).remove(expired);
      if (!error) removed += expired.length;
    }
  }
  return removed;
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ ok: false }, { status: 401 });
  const [{ data, error }, imageUploadsRemoved, documentUploadsRemoved] = await Promise.all([
    createAdminClient().rpc("run_dashboard_retention"),
    removeExpiredQuarantine("images"),
    removeExpiredQuarantine("documents"),
  ]);
  if (error) {
    console.error("Dashboard retention failed", { code: error.code });
    return Response.json({ ok: false }, { status: 500 });
  }
  const result = { database: data, image_uploads_removed: imageUploadsRemoved, document_uploads_removed: documentUploadsRemoved };
  await writeAudit({ actorUserId: null, actorRole: "system", action: "retention.completed", entityType: "retention-run", entityId: new Date().toISOString(), after: result });
  return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
}
