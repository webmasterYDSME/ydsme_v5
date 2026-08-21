-- Migration 023 initially removed the refund check instead of the legacy
-- cash-only composite check because both originated as unnamed constraints.
alter table public.membership_payments drop constraint if exists membership_payments_check1;
alter table public.membership_payments drop constraint if exists membership_payments_refund_amount_check;
alter table public.membership_payments add constraint membership_payments_refund_amount_check
  check (refunded_pence >= 0 and refunded_pence <= amount_pence);
