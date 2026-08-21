import "server-only";

import { headers } from "next/headers";

export async function verifyTurnstile(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
  const localJourneyTest = process.env.JOURNEY_TEST_MODE === "true"
    && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:55321"
    && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (localJourneyTest && !secret && !sitekey) return true;
  if (!secret || !sitekey) {
    return process.env.NODE_ENV !== "production" && !secret && !sitekey;
  }
  if (!token) return false;

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = new URLSearchParams({ secret, response: token });
  if (forwarded) body.set("remoteip", forwarded);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
    });
    const result = await response.json() as { success?: boolean };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}
