import "server-only";

import { cache } from "react";
import { membershipBillingEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";

export type MemberNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  action_href: string | null;
  created_at: string;
  read_at: string | null;
};

export type OwnNotifications = { notifications: MemberNotification[]; unread: number };

const none: OwnNotifications = { notifications: [], unread: 0 };

/**
 * The signed-in member's membership notifications, newest first, read once per request.
 * The sidebar bell and the dashboard both use it. A fault here must not stop a page from opening,
 * so it is logged and treated as "nothing to show".
 */
export const getOwnNotifications = cache(async (): Promise<OwnNotifications> => {
  if (!(await membershipBillingEnabled())) return none;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_own_membership_notifications", { p_limit: 30 });
  if (error) {
    console.error("Own membership notifications could not be loaded", { code: error.code });
    return none;
  }
  const notifications = (data ?? []) as MemberNotification[];
  return { notifications, unread: notifications.filter((notice) => !notice.read_at).length };
});
