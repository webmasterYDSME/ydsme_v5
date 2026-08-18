import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

function clientAddress(headerList: Headers) {
  return headerList.get("cf-connecting-ip")
    || headerList.get("x-real-ip")
    || headerList.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export async function consumeRateLimit(
  scope: string,
  maximumAttempts: number,
  windowSeconds: number,
  discriminator = "",
) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    throw new Error("A rate-limit hashing secret is required.");
  }

  const address = clientAddress(await headers());
  const subjectHash = createHmac("sha256", secret)
    .update(`${scope}\0${address}\0${discriminator.trim().toLowerCase()}`)
    .digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_max_attempts: maximumAttempts,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate-limit check failed", { scope, code: error.code });
    return false;
  }
  return data === true;
}
