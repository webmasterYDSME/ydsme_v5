import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

export type TransactionalEmailAttachment = {
  content: string;
  filename: string;
  content_id?: string;
  content_type?: string;
};

export type TransactionalEmail = {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: TransactionalEmailAttachment[];
};

export type EmailDeliveryResult = { sent: true } | { sent: false; error: string };

const loopbackUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
};

export function usesLocalMailpit() {
  return loopbackUrl(process.env.NEXT_PUBLIC_SITE_URL)
    && loopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && loopbackUrl(process.env.LOCAL_MAILPIT_URL);
}

function mailbox(value: string) {
  const named = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  return named
    ? { Email: named[2].trim(), ...(named[1].trim() ? { Name: named[1].trim() } : {}) }
    : { Email: value.trim() };
}

async function sendToLocalMailpit(email: TransactionalEmail): Promise<EmailDeliveryResult> {
  const endpoint = `${process.env.LOCAL_MAILPIT_URL?.replace(/\/$/, "")}/api/v1/send`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: mailbox(email.from),
        To: email.to.map(mailbox),
        ...(email.reply_to ? { ReplyTo: [mailbox(email.reply_to)] } : {}),
        Subject: email.subject,
        Text: email.text,
        HTML: email.html,
        Tags: ["local-development"],
        ...(email.attachments?.length ? {
          Attachments: email.attachments.map((attachment) => ({
            Content: attachment.content,
            Filename: attachment.filename,
            ...(attachment.content_id ? { ContentID: attachment.content_id } : {}),
            ...(attachment.content_type ? { ContentType: attachment.content_type } : {}),
          })),
        } : {}),
      }),
    });
    if (!response.ok) return { sent: false, error: `Local email catcher returned ${response.status}.` };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Local email delivery failed." };
  }
}

export const EMAIL_LIMIT_MESSAGE = "The daily email limit has been reached. Please try again tomorrow or contact an administrator.";

// Every email that leaves straight from the website (tickets, sign-up codes, cancellations) takes a slot
// from the same daily budget as queued mail. If the budget cannot be read we still send: losing a ticket
// email is worse than going a little over budget.
async function reserveSlot(source: string): Promise<{ id: number | null; refused: boolean }> {
  try {
    const { data, error } = await createServiceClient().rpc("reserve_email_slot", {
      p_class: "immediate",
      p_source: source,
      p_notification_id: null,
    });
    if (error) return { id: null, refused: false };
    if (data === null || data === undefined) return { id: null, refused: true };
    return { id: Number(data), refused: false };
  } catch {
    return { id: null, refused: false };
  }
}

async function settleSlot(id: number | null, sent: boolean) {
  if (id === null) return;
  try {
    await createServiceClient().rpc("release_email_slot", { p_ledger_id: id, p_sent: sent });
  } catch {
    // The slot is tidied up by the next reservation.
  }
}

async function pauseProvider(reason: string) {
  try {
    await createServiceClient().rpc("pause_email_provider", { p_seconds: 3600, p_reason: reason });
  } catch {
    // Best effort only.
  }
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  idempotencyKey?: string,
  source = "transactional",
): Promise<EmailDeliveryResult> {
  if (usesLocalMailpit()) return sendToLocalMailpit(email);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "Email delivery is not configured." };
  const slot = await reserveSlot(source);
  if (slot.refused) return { sent: false, error: EMAIL_LIMIT_MESSAGE };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(email),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; name?: string } | null;
      await settleSlot(slot.id, false);
      if (response.status === 429 && (body?.name === "daily_quota_exceeded" || body?.name === "monthly_quota_exceeded")) {
        await pauseProvider("The email provider says the sending allowance has been used up.");
        return { sent: false, error: EMAIL_LIMIT_MESSAGE };
      }
      return { sent: false, error: body?.message || `Email provider returned ${response.status}.` };
    }
    await settleSlot(slot.id, true);
    return { sent: true };
  } catch (error) {
    await settleSlot(slot.id, false);
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}
