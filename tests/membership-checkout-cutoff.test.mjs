import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipCheckoutWindow, membershipCheckoutQuoteKey } from '../lib/membership-checkout-policy.ts';
import { membershipBillingYear, proratedMembershipFee } from '../lib/membership-rules.ts';

test('November checkout expiry cannot cross midnight entering December',()=>{
 for(const instant of ['2026-11-24T12:00:00Z','2026-11-30T00:00:00Z','2026-11-30T23:28:59Z']) {
  const now=new Date(instant); const window=membershipCheckoutWindow(now);
  assert.equal(window.paused,false);
  assert.ok(window.expiresAt*1000<=Date.parse('2026-12-01T00:00:00Z'));
  assert.ok(window.expiresAt*1000-now.getTime()>30*60_000);
  assert.ok(window.expiresAt*1000-now.getTime()<24*3600_000);
 }
 assert.equal(membershipCheckoutWindow(new Date('2026-11-30T12:00:00Z')).expiresAt,Date.parse('2026-12-01T00:00:00Z')/1000);
});
test('new sessions pause for the last 31 minutes, then December reopens at the new price',()=>{
 for(const instant of ['2026-11-30T23:29:00Z','2026-11-30T23:30:00Z','2026-11-30T23:59:59Z']) assert.equal(membershipCheckoutWindow(new Date(instant)).paused,true);
 const december=new Date('2026-12-01T00:00:00Z');
 assert.deepEqual(membershipCheckoutWindow(december),{expiresAt:undefined,paused:false});
 const november=new Date('2026-11-30T23:59:59Z');
 assert.equal(proratedMembershipFee(6000,november),1000);
 assert.equal(proratedMembershipFee(6000,december),6000);
 assert.equal(membershipBillingYear(november),2026);
 assert.equal(membershipBillingYear(december),2027);
 assert.notEqual(membershipCheckoutQuoteKey('fee',2026,1000),membershipCheckoutQuoteKey('fee',2027,6000));
});
test('the same cutoff rule holds next year and does not pause renewals or December signup',()=>{
 assert.equal(membershipCheckoutWindow(new Date('2027-11-30T23:59:59Z')).paused,true);
 assert.equal(membershipCheckoutWindow(new Date('2027-12-01T00:00:00Z')).paused,false);
 assert.deepEqual(membershipCheckoutWindow(new Date('2026-12-31T23:59:59Z')),{expiresAt:undefined,paused:false});
});
