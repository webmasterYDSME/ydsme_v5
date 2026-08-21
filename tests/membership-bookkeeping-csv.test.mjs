import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMembershipBookkeepingCsv,
  membershipBookkeepingCsvCell,
  membershipPaymentTransactionDate,
} from "../lib/membership-bookkeeping-csv.ts";

const payment = {
  paymentId: "payment-1",
  createdAt: "2026-01-02T09:00:00.000Z",
  updatedAt: "2026-01-04T12:00:00.000Z",
  receivedAt: "2026-01-03T10:00:00.000Z",
  clearedAt: "2026-01-04T11:00:00.000Z",
  membershipYear: 2026,
  memberReference: "member-1",
  legacyMemberReference: "1234",
  memberName: "Alex \"Railway\" Example",
  planName: "Adult",
  method: "cheque",
  grossPence: 6000,
  refundedPence: 1250,
  currency: "gbp",
  status: "partially_refunded",
  offlineReference: "=unsafe-reference",
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: null,
  stripeInvoiceId: null,
  stripeChargeId: null,
  recordingOfficer: "Membership Officer",
  officerReference: "MO-12345678",
};

test("builds the membership bookkeeping CSV with explicit pre-fee arithmetic", () => {
  const csv = buildMembershipBookkeepingCsv([payment]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /"Gross GBP","Refunds GBP","Gross less refunds GBP"/);
  assert.match(lines[1], /"60\.00","12\.50","47\.50","GBP","partially_refunded"/);
  assert.match(lines[1], /"Alex ""Railway"" Example"/);
  assert.match(lines[1], /"'=unsafe-reference"/);
});

test("uses cleared, received and recorded timestamps in bookkeeping order", () => {
  assert.equal(membershipPaymentTransactionDate(payment), payment.clearedAt);
  assert.equal(membershipPaymentTransactionDate({ ...payment, clearedAt: null }), payment.receivedAt);
  assert.equal(membershipPaymentTransactionDate({ ...payment, clearedAt: null, receivedAt: null }), payment.createdAt);
});

test("guards spreadsheet cells against formula execution", () => {
  assert.equal(membershipBookkeepingCsvCell("  +SUM(1,2)"), '"\'  +SUM(1,2)"');
  assert.equal(membershipBookkeepingCsvCell("ordinary"), '"ordinary"');
});

test("queues complete ZIP reports and protects the private download", async () => {
  const root = new URL("../", import.meta.url);
  const [route, page, worker, actions] = await Promise.all([
    readFile(new URL("app/admin/memberships/export/route.ts", root), "utf8"),
    readFile(new URL("app/admin/memberships/page.tsx", root), "utf8"),
    readFile(new URL("supabase/functions/generate-membership-report/index.ts", root), "utf8"),
    readFile(new URL("lib/actions/membership.ts", root), "utf8"),
  ]);
  assert.match(route, /getCurrentUser/);
  assert.match(route, /membershipAdministrationEnabled/);
  assert.match(route, /hasCapability\(role, "memberships\.manage"\)/);
  assert.match(route, /role === "committee"/);
  assert.match(route, /membership_status === "active"/);
  assert.match(route, /private, no-store/);
  assert.match(route, /membership_report_exports/);
  assert.match(route, /membership-reports/);
  assert.match(route, /Content-Type": "application\/zip"/);
  assert.match(worker, /new JSZip\(\)/);
  assert.match(worker, /member-register\.csv/);
  assert.match(worker, /payments-and-reversals\.csv/);
  assert.match(worker, /manifest\.json/);
  assert.match(worker, /financial_totals_pence/);
  assert.match(actions, /requestMembershipReportExport/);
  assert.match(actions, /request_membership_report_generation/);
  assert.match(page, /Prepare records ZIP/);
  assert.match(page, /\/admin\/memberships\/export\?id=/);
});
