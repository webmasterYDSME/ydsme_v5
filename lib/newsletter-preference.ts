import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Whether the signed-in member is on the Society newsletter list, read through their own session. */
export type NewsletterPreference =
  | { linked: false }
  | {
    linked: true;
    /** The membership email address newsletters would go to. */
    email: string | null;
    /** On the list right now: opted in, and neither the mailbox nor the address is blocked. */
    subscribed: boolean;
    optedIn: boolean;
    /** Someone used the unsubscribe link in a newsletter, which stops the whole mailbox. */
    mailboxUnsubscribed: boolean;
    /** Emails to this address bounced or were reported, so subscribing needs an officer's help. */
    addressBlocked: boolean;
    since: string | null;
    source: string | null;
  };

export async function getOwnNewsletterPreference(): Promise<NewsletterPreference | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_own_newsletter_preference");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.linked !== true) return { linked: false };
  const text = (input: unknown) => typeof input === "string" && input ? input : null;
  return {
    linked: true,
    email: text(value.email),
    subscribed: value.subscribed === true,
    optedIn: value.opted_in === true,
    mailboxUnsubscribed: value.mailbox_unsubscribed === true,
    addressBlocked: value.address_blocked === true,
    since: text(value.since),
    source: text(value.source),
  };
}
