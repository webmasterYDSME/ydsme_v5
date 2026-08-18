import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const auditId = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability("audit.view");
  const parsed = auditId.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await createAdminClient()
    .from("audit_logs")
    .select("before_state,after_state")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load audit details" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    { before: data.before_state, after: data.after_state },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
