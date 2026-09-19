import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessAmountReceived, poundsToPence } from "../lib/membership-admin/amount.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("amounts typed as pounds become pence, and anything odd is refused", () => {
  assert.equal(poundsToPence("35"), 3500);
  assert.equal(poundsToPence("35.00"), 3500);
  assert.equal(poundsToPence("35.5"), 3550);
  assert.equal(poundsToPence("£1,200.05"), 120005);
  assert.equal(poundsToPence(" 0.05 "), 5);
  for (const bad of ["", "abc", "-5", "35.999", "3 5 . 0 0 0", "1e3", null, undefined, 35]) assert.equal(poundsToPence(bad), null, String(bad));
});

test("the exact fee, or no amount at all, activates as before", () => {
  assert.deepEqual(assessAmountReceived("35.00", "", 3500), { kind: "exact" });
  assert.deepEqual(assessAmountReceived("35", "", 3500), { kind: "exact" });
  assert.deepEqual(assessAmountReceived(null, null, 3500), { kind: "exact" });
  assert.deepEqual(assessAmountReceived("  ", "", 3500), { kind: "exact" });
});

test("less than the fee records nothing", () => {
  assert.deepEqual(assessAmountReceived("30", "", 3500), { kind: "short", receivedPence: 3000 });
  assert.deepEqual(assessAmountReceived("34.99", "anything", 3500), { kind: "short", receivedPence: 3499 });
});

test("more than the fee needs a note saying what happens to the extra", () => {
  assert.deepEqual(assessAmountReceived("40", "", 3500), { kind: "over-needs-note", receivedPence: 4000 });
  assert.deepEqual(assessAmountReceived("40", "abc", 3500), { kind: "over-needs-note", receivedPence: 4000 });
  assert.deepEqual(assessAmountReceived("40", " Kept as a donation ", 3500), { kind: "over", receivedPence: 4000, extraPence: 500, note: "Kept as a donation" });
  assert.deepEqual(assessAmountReceived("abc", "", 3500), { kind: "invalid" });
});

test("the offline payment forms and actions use the amount received", () => {
  const actions = read("lib/actions/membership.ts");
  assert.equal((actions.match(/assessAmountReceived\(formData\.get\("amount_received"\)/g) ?? []).length, 2);
  assert.match(actions, /membership\.payment-short-reported/);
  assert.match(actions, /membership\.payment-extra-received/);
  assert.match(read("app/admin/memberships/_components/MemberPaymentPanel.tsx"), /name="amount_received"/);
  assert.equal((read("app/admin/memberships/_components/InboxTaskPanel.tsx").match(/name="amount_received"/g) ?? []).length, 2);
});
