import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageContent, requireUser } from "@/lib/auth";
import { documentStoragePath } from "@/lib/storage-path";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function notFoundResponse() {
  return new NextResponse("Document not found.", {
    status: 404,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = z.string().uuid().safeParse((await params).id);
  if (!parsedId.success) return notFoundResponse();

  const { role } = await requireUser();
  const editable = canManageContent(role);
  const client = editable ? createAdminClient() : await createClient();
  let query = client.from("documents").select("id,name,file_url,lifecycle_status").eq("id", parsedId.data);
  if (!editable) query = query.eq("lifecycle_status", "published");
  const { data: document, error } = await query.maybeSingle();
  if (error || !document) return notFoundResponse();

  const path = documentStoragePath(document.file_url);
  if (!path) return notFoundResponse();
  const { data: signed, error: signingError } = await createAdminClient().storage
    .from("documents")
    .createSignedUrl(path, 60);
  if (signingError || !signed?.signedUrl) return notFoundResponse();

  const response = NextResponse.redirect(signed.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
