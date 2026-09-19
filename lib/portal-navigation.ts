import "server-only";

import { countInboxTasks } from "@/lib/membership-admin/inbox";

/** The number shown beside "Memberships" in the sidebar: exactly the number of tasks in the Inbox. */
export async function getMembershipNavigationTaskCount() {
  return countInboxTasks();
}
