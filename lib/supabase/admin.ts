import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

let adminClient: ReturnType<typeof createClient<Database>> | undefined;

export function createAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing server-only Supabase credentials");

  adminClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/**
 * Expand-migration client for new tables that are not in the last checked-in
 * generated Database type yet. Keep all calls server-only and migrate callers
 * back to createAdminClient after the next production type pull.
 */
export function createServiceClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}
