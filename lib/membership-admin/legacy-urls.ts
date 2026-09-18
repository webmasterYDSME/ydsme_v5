// The membership workspace used a single page steered by ?view=, ?section= and ?member=.
// Server actions, stored notification links and bookmarks still use those addresses, so the
// Inbox page maps them onto the current routes instead of every caller being rewritten.
// Pure and import-free so it can be unit tested with `node --experimental-strip-types`.

type Query = Record<string, string | string[] | undefined>;

export const MEMBERSHIP_ADMIN_BASE = "/admin/memberships";

const memberId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const inboxKindBySection: Record<string, string> = {
  applications: "payment",
  "pending-payments": "payment",
  "student-requests": "request",
  "manual-contact": "contact",
  "payment-reviews": "problem",
  "honorary-conflicts": "problem",
  "email-failures": "problem",
  "delivery-problems": "problem",
  "online-payment-problems": "problem",
};

const inboxKindByQueue: Record<string, string> = {
  "payment-review": "problem",
  "delivery-failures": "problem",
  "honorary-payment-review": "problem",
};

const setupTabBySection: Record<string, string> = {
  plans: "fees",
  "payment-settings": "payment",
  reports: "reports",
  "membermojo-import": "import",
};

const setupTabByView: Record<string, string> = { plans: "fees", reports: "reports" };

/**
 * Returns the current address for an old-style membership URL, or null when the query holds
 * nothing that needs translating. Only `notice` and `error` are carried across, so the result
 * can never be translated again.
 */
export function legacyMembershipRedirect(query: Query): string | null {
  const view = first(query.view);
  const section = first(query.section);
  const member = first(query.member);
  const queue = first(query.queue);
  if (!view && !section && !member && !queue) return null;

  const carried: [string, string][] = [];
  for (const key of ["notice", "error"]) {
    const value = first(query[key]);
    if (value) carried.push([key, value]);
  }
  const to = (path: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(carried);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  if (member && memberId.test(member)) return to(`${MEMBERSHIP_ADMIN_BASE}/members/${member}`);

  if (section) {
    if (inboxKindBySection[section]) return to(MEMBERSHIP_ADMIN_BASE, { kind: inboxKindBySection[section] });
    if (setupTabBySection[section]) return to(`${MEMBERSHIP_ADMIN_BASE}/setup`, { tab: setupTabBySection[section] });
    if (section === "renewals") return to(`${MEMBERSHIP_ADMIN_BASE}/renewals`);
    if (section === "add-member") return to(`${MEMBERSHIP_ADMIN_BASE}/members`, { add: "member" });
    if (section === "honorary") return to(`${MEMBERSHIP_ADMIN_BASE}/members`, { status: "honorary" });
    if (section === "member-history") return to(`${MEMBERSHIP_ADMIN_BASE}/members`);
  }

  if (queue && inboxKindByQueue[queue]) return to(MEMBERSHIP_ADMIN_BASE, { kind: inboxKindByQueue[queue] });

  if (view === "members") return to(`${MEMBERSHIP_ADMIN_BASE}/members`);
  if (view === "payments") return to(`${MEMBERSHIP_ADMIN_BASE}/renewals`);
  if (view && setupTabByView[view]) return to(`${MEMBERSHIP_ADMIN_BASE}/setup`, { tab: setupTabByView[view] });

  return to(MEMBERSHIP_ADMIN_BASE);
}
