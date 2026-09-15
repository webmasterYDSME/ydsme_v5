import { NextResponse } from "next/server";
import { getCurrentUser, getRole, canManageContent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import { eventPolishSchema, requestPolishedDescription } from "@/lib/event-polish";

export const runtime = "nodejs";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getTrustedAppOrigin()) return reply({ error: "This request is not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return reply({ error: "Please sign in again to polish this description." }, 401);
  const [role, { data: profile }] = await Promise.all([
    getRole(user.id),
    createAdminClient().from("users").select("membership_status").eq("id", user.id).maybeSingle(),
  ]);
  if (!canManageContent(role) || profile?.membership_status !== "active") return reply({ error: "You do not have permission to edit events." }, 403);
  let input;
  try {
    const body = await request.text();
    if (body.length > 32000) return reply({ error: "The description is too long." }, 400);
    input = eventPolishSchema.safeParse(JSON.parse(body));
  } catch {
    return reply({ error: "The request could not be read." }, 400);
  }
  if (!input.success) return reply({ error: "Enter between 50 and 5000 characters and check the event settings." }, 400);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return reply({ error: "AI polishing has not been configured yet. You can still write and save your description." }, 503);
  if (!await consumeRateLimit("event-description-polish", 20, 3600, user.id)) return reply({ error: "You have reached the polishing limit. Please try again later." }, 429);
  try {
    const description = await requestPolishedDescription(input.data, { apiKey, model: process.env.OPENAI_EVENT_DESCRIPTION_MODEL || "gpt-4.1-mini" });
    return reply({ description });
  } catch {
    return reply({ error: "AI polishing is temporarily unavailable. Your description has not changed. Please try again later." }, 502);
  }
}
