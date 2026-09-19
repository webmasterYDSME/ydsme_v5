/**
 * The amount an officer says they actually received for an offline (cash, cheque or bank) membership payment,
 * compared with the fee that is due.
 *
 *  - the same amount: the membership is activated as before;
 *  - less than the fee: nothing is recorded and the officer is asked to collect the rest;
 *  - more than the fee: the membership is activated for the fee, and a note says what happens to the extra.
 */

/** "35", "35.5", "£35.00" and "1,200.00" become pence. Anything else, including negatives and fractions of a penny, is null. */
export function poundsToPence(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[£,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
}

export type AmountAssessment =
  | { kind: "exact" }
  | { kind: "invalid" }
  | { kind: "short"; receivedPence: number }
  | { kind: "over-needs-note"; receivedPence: number }
  | { kind: "over"; receivedPence: number; extraPence: number; note: string };

/** A form that does not send the amount (older pages, scripts) is treated as the exact fee. */
export function assessAmountReceived(rawAmount: unknown, rawNote: unknown, duePence: number): AmountAssessment {
  if (rawAmount == null || (typeof rawAmount === "string" && rawAmount.trim() === "")) return { kind: "exact" };
  const receivedPence = poundsToPence(rawAmount);
  if (receivedPence === null) return { kind: "invalid" };
  if (receivedPence === duePence) return { kind: "exact" };
  if (receivedPence < duePence) return { kind: "short", receivedPence };
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length < 5) return { kind: "over-needs-note", receivedPence };
  return { kind: "over", receivedPence, extraPence: receivedPence - duePence, note: note.slice(0, 300) };
}
