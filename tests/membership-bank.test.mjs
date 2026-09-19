import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatAccountNumberAsTyped, formatSortCodeAsTyped, normaliseAccountNumber, normaliseSortCode } from "../lib/membership-admin/bank.ts";

test("a sort code is laid out as 12-34-56 while it is typed", () => {
  assert.equal(formatSortCodeAsTyped(""), "");
  assert.equal(formatSortCodeAsTyped("1"), "1");
  assert.equal(formatSortCodeAsTyped("123"), "12-3");
  assert.equal(formatSortCodeAsTyped("123456"), "12-34-56");
  assert.equal(formatSortCodeAsTyped("12-34-56"), "12-34-56");
  assert.equal(formatSortCodeAsTyped("12 34 56 78"), "12-34-56");
  assert.equal(formatSortCodeAsTyped("ab12cd34"), "12-34");
});

test("a complete sort code is saved in one form, and anything else is refused", () => {
  assert.equal(normaliseSortCode("123456"), "12-34-56");
  assert.equal(normaliseSortCode(" 12 34 56 "), "12-34-56");
  assert.equal(normaliseSortCode("12-34-56"), "12-34-56");
  assert.equal(normaliseSortCode("12–34–56"), "12-34-56");
  assert.equal(normaliseSortCode("12345"), null);
  assert.equal(normaliseSortCode("1234567"), null);
  assert.equal(normaliseSortCode("12-34-5a"), null);
  assert.equal(normaliseSortCode(""), null);
});

test("an account number is eight digits, typed or pasted", () => {
  assert.equal(formatAccountNumberAsTyped("1234 5678 90"), "12345678");
  assert.equal(formatAccountNumberAsTyped("ab12"), "12");
  assert.equal(normaliseAccountNumber("12345678"), "12345678");
  assert.equal(normaliseAccountNumber("1234 5678"), "12345678");
  assert.equal(normaliseAccountNumber("1234567"), null);
  assert.equal(normaliseAccountNumber("123456789"), null);
  assert.equal(normaliseAccountNumber("1234567a"), null);
});

test("the payment settings form and action use the same sort code rules", () => {
  const action = readFileSync(new URL("../lib/actions/membership.ts", import.meta.url), "utf8");
  assert.match(action, /normaliseSortCode\(value\) \?\? value/);
  assert.match(action, /payment-sort-code-invalid/);
  const form = readFileSync(new URL("../app/admin/memberships/MembershipPaymentSettings.tsx", import.meta.url), "utf8");
  assert.match(form, /<SortCodeInput name="bank_sort_code"/);
  assert.match(form, /<AccountNumberInput name="bank_account_number"/);
  assert.match(action, /normaliseAccountNumber\(value\) \?\? value/);
  assert.match(action, /payment-account-number-invalid/);
  const sql = readFileSync(new URL("../supabase/migrations/202609190010_membership_default_bank_instructions.sql", import.meta.url), "utf8");
  assert.match(sql, /Use your full name as the payment reference/);
  assert.match(sql, /where not configured/);
});
