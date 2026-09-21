import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { EmailQueueOverview } from "@/lib/email-queue-format";

/** Where the email queue stands right now: today's budget and how much mail is waiting. Null if it cannot be read. */
export async function loadEmailQueueOverview(): Promise<EmailQueueOverview | null> {
  const { data, error } = await createServiceClient().rpc("email_queue_overview");
  if (error || !data) return null;
  return data as EmailQueueOverview;
}
