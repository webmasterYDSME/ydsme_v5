import "server-only";

import { inboxKinds, loadInbox } from "@/lib/membership-admin/inbox";

export type AttentionSummary = { total: number; items: Array<{ key: string; label: string; count: number; href: string }> };

/**
 * What a membership officer has waiting, grouped the way the Inbox groups it. Built from the same
 * list the Inbox shows, so the numbers always agree with it. A fault is logged and the strip is left
 * out: the dashboard must still open.
 */
export async function loadAttention(): Promise<AttentionSummary | null> {
  try {
    const { tasks } = await loadInbox();
    const items = inboxKinds
      .map((kind) => ({ key: kind.key, label: kind.label, count: tasks.filter((task) => task.kind === kind.key).length, href: `/admin/memberships?kind=${kind.key}` }))
      .filter((item) => item.count > 0);
    return { total: tasks.length, items };
  } catch (error) {
    console.error("Membership tasks could not be summarised for the dashboard", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
