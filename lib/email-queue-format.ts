// Pure helpers for the email queue screens. No imports, so they can be unit tested with
// `node --experimental-strip-types`.

export type EmailBudget = {
  daily_limit: number;
  immediate_reserve: number;
  used: number;
  remaining: number;
  bulk_remaining: number;
  bulk_paused: boolean;
  blocked_until: string | null;
  blocked_reason: string | null;
  next_bulk_slot_at: string | null;
};

export type EmailQueueOverview = {
  budget: EmailBudget;
  settings: { bulk_batch_size: number };
  queued_immediate: number;
  queued_bulk: number;
  sending: number;
  failed: number;
  cancelled: number;
  sent_7_days: number;
  oldest_queued_at: string | null;
};

/** Emails per day that queued (bulk) mail may use: the daily limit less the room kept for immediate mail. */
export function bulkPerDay(budget: Pick<EmailBudget, "daily_limit" | "immediate_reserve">): number {
  return Math.max(0, budget.daily_limit - budget.immediate_reserve);
}

/** Whole days needed to send everything waiting in the bulk queue. 0 when nothing waits, null when bulk mail cannot go out. */
export function daysToClear(queuedBulk: number, perDay: number): number | null {
  if (queuedBulk <= 0) return 0;
  if (perDay <= 0) return null;
  return Math.ceil(queuedBulk / perDay);
}

export function clearEstimateLabel(queuedBulk: number, perDay: number): string {
  const days = daysToClear(queuedBulk, perDay);
  if (days === null) return "Queued mail cannot go out until the daily limit is raised.";
  if (days === 0) return "Nothing is waiting.";
  if (days === 1) return "About a day to send everything that is waiting.";
  return `About ${days} days to send everything that is waiting.`;
}

export const QUEUE_STATUSES = ["queued", "sending", "sent", "failed", "cancelled"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export const QUEUE_CLASSES = ["immediate", "bulk"] as const;
export type QueueClass = (typeof QUEUE_CLASSES)[number];

export const statusLabels: Record<QueueStatus, string> = {
  queued: "Waiting",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Stopped",
};

export const classLabels: Record<QueueClass, string> = { immediate: "Immediate", bulk: "Bulk" };

export function parseQueueStatus(value: string | undefined | null): QueueStatus | "all" {
  return (QUEUE_STATUSES as readonly string[]).includes(value ?? "") ? (value as QueueStatus) : "all";
}

export function parseQueueClass(value: string | undefined | null): QueueClass | "all" {
  return (QUEUE_CLASSES as readonly string[]).includes(value ?? "") ? (value as QueueClass) : "all";
}

/** Settings as typed into the form, checked against each other. Returns an error message or the cleaned numbers. */
export function checkQueueSettings(input: { dailyLimit: number; immediateReserve: number; bulkBatchSize: number }):
  { ok: true; dailyLimit: number; immediateReserve: number; bulkBatchSize: number } | { ok: false; error: string } {
  const { dailyLimit, immediateReserve, bulkBatchSize } = input;
  if (![dailyLimit, immediateReserve, bulkBatchSize].every(Number.isInteger)) return { ok: false, error: "Use whole numbers." };
  if (dailyLimit < 1 || dailyLimit > 100000) return { ok: false, error: "The daily limit must be between 1 and 100,000." };
  if (immediateReserve < 0 || immediateReserve >= dailyLimit) return { ok: false, error: "The room kept for immediate mail must be below the daily limit." };
  if (bulkBatchSize < 1 || bulkBatchSize > 100) return { ok: false, error: "Send between 1 and 100 queued emails at a time." };
  return { ok: true, dailyLimit, immediateReserve, bulkBatchSize };
}

/** "membership.renewal-invitation" -> "Renewal invitation" */
export function kindLabel(kind: string): string {
  const words = kind.replace(/^membership\./, "").split(/[._-]+/).filter(Boolean).join(" ");
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Email";
}

/** What an administrator may do with an email in this state. */
export function queueRowActions(status: string): { requeue: boolean; stop: boolean } {
  return { requeue: status === "failed" || status === "cancelled", stop: status === "queued" || status === "failed" };
}

/** Which list the page opens on: what needs attention first, otherwise what went out most recently. */
export function defaultQueueStatus(counts: { waiting: number; sending: number; failed: number }): QueueStatus {
  if (counts.failed > 0) return "failed";
  if (counts.waiting > 0 || counts.sending > 0) return "queued";
  return "sent";
}
