import "server-only";

import { headers } from "next/headers";

export async function verifyTurnstile(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
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
