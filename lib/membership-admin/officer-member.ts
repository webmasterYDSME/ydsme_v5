// What the Add a membership form sends back after a failed attempt, so the officer keeps what they typed.
// No imports, so it can be unit tested with `node --experimental-strip-types`.

export type OfficerMemberState = {
  /** Error code for the last failed attempt, or null before the first attempt. */
  error: string | null;
  /** Counts failed attempts, so the form can rebuild its date fields from `values`. */
  attempt: number;
  /** The submitted text and tick boxes, by field name. */
  values: Record<string, string>;
};

export const emptyOfficerMemberState: OfficerMemberState = { error: null, attempt: 0, values: {} };

/** The submitted fields as plain text, without the framework's hidden action fields or uploaded files. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$") || typeof value !== "string") continue;
    values[key] = value.slice(0, 1000);
  }
  return values;
}
