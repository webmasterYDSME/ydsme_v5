import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  bulkPerDay, checkQueueSettings, clearEstimateLabel, defaultQueueStatus, daysToClear, kindLabel, parseQueueClass, parseQueueStatus, queueRowActions,
} from "../lib/email-queue-format.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("queued mail gets the daily limit less the room kept for immediate mail", () => {
  assert.equal(bulkPerDay({ daily_limit: 100, immediate_reserve: 30 }), 70);
  assert.equal(bulkPerDay({ daily_limit: 10, immediate_reserve: 10 }), 0);
});

test("the clearing estimate rounds up and says so when nothing can go", () => {
  assert.equal(daysToClear(0, 70), 0);
  assert.equal(daysToClear(70, 70), 1);
  assert.equal(daysToClear(203, 70), 3);
  assert.equal(daysToClear(5, 0), null);
  assert.equal(clearEstimateLabel(203, 70), "About 3 days to send everything that is waiting.");
  assert.equal(clearEstimateLabel(10, 70), "About a day to send everything that is waiting.");
  assert.equal(clearEstimateLabel(0, 70), "Nothing is waiting.");
  assert.match(clearEstimateLabel(5, 0), /cannot go out/);
});

test("filters accept only known values and rows offer the right buttons", () => {
  assert.equal(parseQueueStatus("failed"), "failed");
  assert.equal(parseQueueStatus("drop table"), "all");
  assert.equal(parseQueueClass("bulk"), "bulk");
  assert.equal(parseQueueClass(undefined), "all");
  assert.deepEqual(queueRowActions("failed"), { requeue: true, stop: true });
  assert.deepEqual(queueRowActions("queued"), { requeue: false, stop: true });
  assert.deepEqual(queueRowActions("cancelled"), { requeue: true, stop: false });
  assert.deepEqual(queueRowActions("sent"), { requeue: false, stop: false });
  assert.equal(kindLabel("membership.renewal-invitation"), "Renewal invitation");
});

test("queue settings are checked against each other", () => {
  assert.equal(checkQueueSettings({ dailyLimit: 100, immediateReserve: 30, bulkBatchSize: 10 }).ok, true);
  assert.equal(checkQueueSettings({ dailyLimit: 100, immediateReserve: 100, bulkBatchSize: 10 }).ok, false);
  assert.equal(checkQueueSettings({ dailyLimit: 0, immediateReserve: 0, bulkBatchSize: 10 }).ok, false);
  assert.equal(checkQueueSettings({ dailyLimit: 100, immediateReserve: 30, bulkBatchSize: 500 }).ok, false);
  assert.equal(checkQueueSettings({ dailyLimit: 100.5, immediateReserve: 30, bulkBatchSize: 10 }).ok, false);
  assert.equal(checkQueueSettings({ dailyLimit: Number.NaN, immediateReserve: 30, bulkBatchSize: 10 }).ok, false);
});

test("only administrators can reach the email queue, and every action asks again", async () => {
  const [layout, page, actions, nav] = await Promise.all([
    read("app/administrator/layout.tsx"), read("app/administrator/email-queue/page.tsx"),
    read("app/administrator/email-queue/actions.ts"), read("lib/portal-nav.ts"),
  ]);
  assert.match(layout, /roles=\{\["administrator"\]\}/);
  assert.match(page, /requireRole\(\["administrator"\]\)/);
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
  assert.ok(exported.length >= 6);
  assert.equal((actions.match(/await administrator\(\)/g) ?? []).length, exported.length);
  assert.match(actions, /requireRole\(\["administrator"\]\)/);
  assert.match(nav, /administration: PortalNavItem\[\][\s\S]*\/administrator\/email-queue/);
  assert.match(nav, /input\.administrator\) sections\.push\(\{ id: "administration"/);
});

test("opening renewals emails nobody; invitations and tests are separate, queued steps", async () => {
  const [actions, overview] = await Promise.all([read("lib/actions/membership-renewals.ts"), read("app/admin/memberships/_components/RenewalsOverview.tsx")]);
  const open = actions.slice(actions.indexOf("export async function openRenewalCampaign"), actions.indexOf("export async function sendRenewalInvitations"));
  assert.doesNotMatch(open, /queue_membership_renewal_invitation|request_membership_notification_delivery/);
  assert.match(actions, /export async function sendRenewalInvitations/);
  assert.match(actions, /queue_membership_renewal_test/);
  assert.match(overview, /Send me a test/);
  assert.match(overview, /Send invitations/);
});

test("delivery honours the budget and the provider's limits", async () => {
  const [edge, app, migration] = await Promise.all([
    read("supabase/functions/deliver-membership-notifications/index.ts"), read("lib/email-delivery.ts"),
    read("supabase/migrations/202609200003_email_queue.sql"),
  ]);
  assert.match(edge, /response\.status === 429/);
  assert.match(edge, /daily_quota_exceeded/);
  assert.match(edge, /defer_membership_notification/);
  assert.match(edge, /pause_email_provider/);
  assert.match(app, /reserve_email_slot/);
  assert.match(app, /release_email_slot/);
  assert.match(migration, /email_send_ledger/);
  assert.match(migration, /revoke all on function public\.reserve_email_slot/);
});

test("the queue page opens on what needs attention", () => {
  assert.equal(defaultQueueStatus({ waiting: 5, sending: 0, failed: 2 }), "failed");
  assert.equal(defaultQueueStatus({ waiting: 5, sending: 0, failed: 0 }), "queued");
  assert.equal(defaultQueueStatus({ waiting: 0, sending: 1, failed: 0 }), "queued");
  assert.equal(defaultQueueStatus({ waiting: 0, sending: 0, failed: 0 }), "sent");
});
