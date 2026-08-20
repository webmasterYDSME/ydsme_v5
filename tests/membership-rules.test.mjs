import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ageOn,
  membershipBillingYear,
  membershipRenewalAt,
  proratedMembershipFee,
} from "../lib/membership-rules.ts";

test("prorates annual membership by inclusive remaining calendar months", () => {
  const annual = 6000;
  const expected = [6000, 5500, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 6000];
  for (let month = 0; month < 12; month += 1) {
    assert.equal(proratedMembershipFee(annual, new Date(Date.UTC(2026, month, 20))), expected[month]);
  }
});

test("rounds prorated fees to the nearest penny and gives December to the following full term", () => {
  assert.equal(proratedMembershipFee(3001, new Date(Date.UTC(2026, 7, 1))), 1250);
  assert.equal(proratedMembershipFee(1500, new Date(Date.UTC(2026, 11, 31))), 1500);
  assert.equal(membershipBillingYear(new Date(Date.UTC(2026, 10, 30))), 2026);
  assert.equal(membershipBillingYear(new Date(Date.UTC(2026, 11, 1))), 2027);
  assert.equal(membershipRenewalAt(2027).toISOString(), "2028-01-01T00:00:00.000Z");
});

test("calculates exact age boundaries without local-time drift", () => {
  assert.equal(ageOn("2008-08-20", new Date("2026-08-20T00:00:00Z")), 18);
  assert.equal(ageOn("2008-08-21", new Date("2026-08-20T23:59:59Z")), 17);
  assert.equal(ageOn("1946-08-20", new Date("2026-08-20T12:00:00Z")), 80);
});

test("membership integration uses hosted Checkout, verified webhooks and entitlement-only honorary grants", async () => {
  const root = new URL("../", import.meta.url);
  const [membership, webhook, workflows, reversals, operations, serviceGrant] = await Promise.all([
    readFile(new URL("lib/membership.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200003_membership_workflows.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200004_membership_reversals_and_delivery.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200006_membership_operations.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/202608200014_membership_plan_service_grant.sql", root), "utf8"),
  ]);
  assert.match(membership, /mode: "subscription"/);
  assert.doesNotMatch(membership, /payment_method_types/);
  assert.match(membership, /integration_identifier: MEMBERSHIP_INTEGRATION_IDENTIFIER/);
  assert.match(webhook, /constructEvent\(payload, signature, webhookSecret\)/);
  assert.match(webhook, /activate_membership_application/);
  assert.match(webhook, /activate_membership_renewal/);
  assert.match(workflows, /grant_lifetime_honorary_membership/);
  const honoraryBody = workflows.split("create or replace function public.grant_lifetime_honorary_membership")[1]
    .split("create or replace function public.revoke_lifetime_honorary_membership")[0];
  assert.doesNotMatch(honoraryBody, /insert into public\.membership_payments/);
  assert.match(reversals, /status = 'payment_review'/);
  assert.match(operations, /plan\.slug='junior'/);
  assert.match(operations, /new\.membership_status in \('suspended','archived'\)/);
  assert.match(serviceGrant, /grant select on public\.public_membership_plans to service_role/);
});
