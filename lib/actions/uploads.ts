"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadIntentResult =
  | { ok: true; bucket: "images" | "documents"; path: string; token: string }
  | { ok: false; error: string };

const rules = {
  "event-image": { capability: "events.manage" as const, bucket: "images" as const, maximum: 8 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
  "committee-image": { capability: "settings.manage" as const, bucket: "images" as const, maximum: 8 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
  document: { capability: "documents.manage" as const, bucket: "documents" as const, maximum: 12 * 1024 * 1024, types: ["application/pdf"] },
};

export async function createUploadIntent(input: unknown): Promise<UploadIntentResult> {
  const parsed = z.object({ kind: z.enum(["event-image", "committee-image", "document"]), name: z.string().min(1).max(255), size: z.number().int().positive(), type: z.string().max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload request." };
  const rule = rules[parsed.data.kind];
  const { user } = await requireCapability(rule.capability);
  if (parsed.data.size > rule.maximum || !rule.types.includes(parsed.data.type)) return { ok: false, error: "That file type or size is not allowed." };
  const safeName = parsed.data.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase().slice(-100);
  const path = `quarantine/${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await createAdminClient().storage.from(rule.bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return { ok: false, error: "The secure upload could not be prepared." };
  return { ok: true, bucket: rule.bucket, path: data.path, token: data.token };
}
