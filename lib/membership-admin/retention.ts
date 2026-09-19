import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { RetentionRow } from "@/lib/membership-admin/retention-groups";

export type RetentionSettings = {
  enabled: boolean;
  enabled_at: string | null;
  last_run_on: string | null;
  last_result: Record<string, unknown> | null;
};

/** The switch, and everyone who is due or nearly due, as the daily job sees them. */
export async function loadRetention(): Promise<{ settings: RetentionSettings; rows: RetentionRow[] }> {
  const admin = createServiceClient();
  const [settings, candidates] = await Promise.all([
    admin.from("membership_retention_settings").select("enabled,enabled_at,last_run_on,last_result").eq("singleton", true).maybeSingle(),
    admin.rpc("membership_retention_candidates", { p_horizon_days: 62 }),
  ]);
  if (settings.error || candidates.error) throw new Error("Unable to read the retention list.");
  return {
    settings: (settings.data as RetentionSettings | null) ?? { enabled: false, enabled_at: null, last_run_on: null, last_result: null },
    rows: (candidates.data ?? []) as RetentionRow[],
  };
}

/** How many people are already past their date but not yet handled, while the switch is off. Zero once it is on. */
export async function countRetentionWaitingForSwitch(): Promise<number> {
  const admin = createServiceClient();
  const { data: settings } = await admin.from("membership_retention_settings").select("enabled").eq("singleton", true).maybeSingle();
  if (settings?.enabled) return 0;
  const { data, error } = await admin.rpc("membership_retention_candidates", { p_horizon_days: 0 });
  if (error) return 0;
  return ((data ?? []) as RetentionRow[]).filter((row) => row.action === "anonymise" || row.action === "warn").length;
}
