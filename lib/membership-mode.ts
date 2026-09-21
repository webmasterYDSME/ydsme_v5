import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadEmailQueueOverview } from "@/lib/email-queue";
import { configuration as membershipConfiguration } from "@/lib/membership-admin/inbox";
import { loadPlansAndPrices } from "@/lib/membership-admin/records";
import { feeInForce } from "@/lib/membership-admin/renewals";
import { membershipBillingYear } from "@/lib/membership-rules";
import { evaluateReadiness, type MembershipModeName, type ReadinessCheck } from "@/lib/membership-mode-format";

export type ModeChange = {
  id: number;
  changedAt: string;
  changedBy: string | null;
  from: MembershipModeName;
  to: MembershipModeName;
  reason: string;
  cancelledEmails: number;
};

export type ModeState = {
  mode: MembershipModeName;
  changedAt: string | null;
  changedBy: string | null;
  websiteSince: string | null;
  history: ModeChange[];
};

/** Who runs membership now, who chose it and when, and the last few switches. Falls back to MemberMojo if unreadable. */
export async function loadModeState(): Promise<ModeState & { readable: boolean }> {
  noStore(); // The switch page must never show what was true before the last change.
  const admin = createServiceClient();
  const [settings, changes] = await Promise.all([
    admin.from("membership_mode_settings").select("mode,website_since,changed_at,changed_by").eq("id", true).maybeSingle(),
    admin.from("membership_mode_changes").select("id,changed_at,changed_by,from_mode,to_mode,reason,cancelled_emails").order("changed_at", { ascending: false }).limit(10),
  ]);
  const rows = (changes.data ?? []) as Array<{ id: number; changed_at: string; changed_by: string | null; from_mode: MembershipModeName; to_mode: MembershipModeName; reason: string; cancelled_emails: number }>;
  const ids = [...new Set([...rows.map((row) => row.changed_by), settings.data?.changed_by].filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await admin.from("users").select("id,full_name,email").in("id", ids);
    for (const user of (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>) names.set(user.id, user.full_name?.trim() || user.email);
  }
  const who = (id: string | null | undefined) => (id ? names.get(id) ?? "An administrator" : null);
  return {
    readable: !settings.error && Boolean(settings.data),
    mode: settings.data?.mode === "website" ? "website" : "membermojo",
    changedAt: settings.data?.changed_at ?? null,
    changedBy: who(settings.data?.changed_by),
    websiteSince: settings.data?.website_since ?? null,
    history: rows.map((row) => ({
      id: row.id, changedAt: row.changed_at, changedBy: who(row.changed_by), from: row.from_mode, to: row.to_mode,
      reason: row.reason, cancelledEmails: row.cancelled_emails,
    })),
  };
}

/** The checks shown before the website takes over. Also run again on the server when the switch is made. */
export async function loadReadiness(): Promise<ReadinessCheck[]> {
  noStore();
  const admin = createServiceClient();
  const year = membershipBillingYear();
  const [{ plans, prices }, queue, lastImport, active, withLogin] = await Promise.all([
    loadPlansAndPrices(),
    loadEmailQueueOverview(),
    admin.from("audit_logs").select("occurred_at").eq("action", "membermojo.list-imported").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("members").select("id", { count: "exact", head: true }).in("effective_state", ["active", "grace", "honorary"]),
    admin.from("members").select("id", { count: "exact", head: true }).in("effective_state", ["active", "grace", "honorary"]).not("auth_user_id", "is", null),
  ]);
  const ready = membershipConfiguration();
  const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY || "";
  return evaluateReadiness({
    now: new Date(),
    year,
    paymentsConfigured: ready.payments,
    paymentsInTestMode: /^(sk|rk)_test_/.test(key),
    emailConfigured: ready.email,
    missingFees: plans.filter((plan) => plan.active && !feeInForce(prices, plan.id, year)).map((plan) => plan.name as string),
    lastImportAt: lastImport.data?.occurred_at ?? null,
    activeMembers: active.count ?? 0,
    activeWithLogin: withLogin.count ?? 0,
    emailQueue: queue ? {
      failed: queue.failed,
      providerPaused: Boolean(queue.budget.blocked_until && new Date(queue.budget.blocked_until).getTime() > Date.now()),
      bulkPaused: queue.budget.bulk_paused,
    } : null,
  });
}
