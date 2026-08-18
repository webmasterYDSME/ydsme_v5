import "server-only";

import type { AppRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database";

type AuditInput = {
  actorUserId: string | null;
  actorRole: AppRole | "system";
  action: string;
  entityType: string;
  entityId: string | number;
  summary?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

function redact(value?: Record<string, unknown> | null): Json | null {
  if (!value) return null;
  const blocked = new Set(["password", "token", "secret", "captchaToken", "payment_method"]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.has(key))
      .map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 500) : item]),
  ) as Json;
}

export async function writeAudit(input: AuditInput) {
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    action: input.action.slice(0, 120),
    entity_type: input.entityType.slice(0, 80),
    entity_id: String(input.entityId).slice(0, 180),
    summary: (input.summary ?? "").slice(0, 500),
    before_state: redact(input.before),
    after_state: redact(input.after),
  });
  if (error) throw new Error("The change was saved, but its audit record could not be written.");
}
