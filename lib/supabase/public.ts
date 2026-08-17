import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing public Supabase credentials");
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function publicStorageUrl(path?: string | null, bucket = "images") {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const cleanPath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanPath}`;
}
