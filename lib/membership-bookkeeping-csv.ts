export const MEMBERSHIP_BOOKKEEPING_HEADERS = [
  "Transaction date",
  "Recorded at",
  "Last updated at",
  "Membership year",
  "Member reference",
  "Legacy member reference",
  "Member name",
  "Plan",
  "Payment method",
  "Gross GBP",
  "Refunds GBP",
  "Gross less refunds GBP",
  "Currency",
  "Status",
  "Receipt / payment reference",
  "Offline reference",
  "Stripe Checkout Session",
  "Stripe PaymentIntent",
  "Stripe Invoice",
  "Stripe Charge",
  "Recording officer",
  "Officer reference",
  "Payment record ID",
] as const;

export type MembershipBookkeepingPayment = {
  paymentId: string;
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
  clearedAt: string | null;
  membershipYear: number;
  memberReference: string;
  legacyMemberReference: string | null;
  memberName: string;
  planName: string;
  method: string;
  grossPence: number;
  refundedPence: number;
  currency: string;
  status: string;
  offlineReference: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  stripeChargeId: string | null;
  recordingOfficer: string | null;
  officerReference: string | null;
};

export function membershipPaymentTransactionDate(payment: MembershipBookkeepingPayment) {
  return payment.clearedAt ?? payment.receivedAt ?? payment.createdAt;
}

function primaryPaymentReference(payment: MembershipBookkeepingPayment) {
  return payment.offlineReference
    ?? payment.stripePaymentIntentId
    ?? payment.stripeChargeId
    ?? payment.stripeCheckoutSessionId
    ?? payment.stripeInvoiceId;
}

export function membershipBookkeepingCsvCell(value: unknown) {
  let text = String(value ?? "").replaceAll("\u0000", "");
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildMembershipBookkeepingCsv(payments: MembershipBookkeepingPayment[]) {
  const rows: unknown[][] = [
    [...MEMBERSHIP_BOOKKEEPING_HEADERS],
    ...payments.map((payment) => [
      membershipPaymentTransactionDate(payment),
      payment.createdAt,
      payment.updatedAt,
      payment.membershipYear,
      payment.memberReference,
      payment.legacyMemberReference,
      payment.memberName,
      payment.planName,
      payment.method,
      (payment.grossPence / 100).toFixed(2),
      (payment.refundedPence / 100).toFixed(2),
      ((payment.grossPence - payment.refundedPence) / 100).toFixed(2),
      payment.currency.toUpperCase(),
      payment.status,
      primaryPaymentReference(payment),
      payment.offlineReference,
      payment.stripeCheckoutSessionId,
      payment.stripePaymentIntentId,
      payment.stripeInvoiceId,
      payment.stripeChargeId,
      payment.recordingOfficer,
      payment.officerReference,
      payment.paymentId,
    ]),
  ];

  return `${rows.map((row) => row.map(membershipBookkeepingCsvCell).join(",")).join("\r\n")}\r\n`;
}
