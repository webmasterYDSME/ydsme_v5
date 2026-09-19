import assert from "node:assert/strict";
import test from "node:test";
import { groupRetention, retentionDateLabel, retentionDetail } from "../lib/membership-admin/retention-groups.ts";

const row = (overrides) => ({
  member_id: "m", full_name: "A Member", contact_email: null, effective_state: "lapsed", basis: "last_paid_year",
  last_paid_year: 2023, retain_until: "2024-12-31", warned_at: null, blocked_reason: null, action: "upcoming", ...overrides,
});

test("the retention list is split by what will happen next", () => {
  const groups = groupRetention([
    row({ member_id: "1", action: "anonymise" }), row({ member_id: "2", action: "warn" }), row({ member_id: "3", action: "waiting" }),
    row({ member_id: "4", action: "blocked", blocked_reason: "Legal hold" }), row({ member_id: "5", action: "upcoming" }), row({ member_id: "6", action: "warn" }),
  ]);
  assert.deepEqual(groups.ready.map((r) => r.member_id), ["1"]);
  assert.deepEqual(groups.warn.map((r) => r.member_id), ["2", "6"]);
  assert.deepEqual(groups.waiting.map((r) => r.member_id), ["3"]);
  assert.deepEqual(groups.blocked.map((r) => r.member_id), ["4"]);
  assert.deepEqual(groups.upcoming.map((r) => r.member_id), ["5"]);
});

test("dates and reasons read in plain words", () => {
  assert.equal(retentionDateLabel("2027-12-31"), "31 December 2027");
  assert.equal(retentionDetail(row({})), "Lapsed · Last paid for 2023 · details kept until 31 December 2024");
  assert.equal(retentionDetail(row({ basis: "created", last_paid_year: null, effective_state: "payment_review" })), "Payment being checked · Never paid · details kept until 31 December 2024");
});
