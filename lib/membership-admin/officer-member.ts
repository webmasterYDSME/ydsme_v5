// What the Add a membership form sends back after a failed attempt, so the officer keeps what they typed.
// No imports, so it can be unit tested with `node --experimental-strip-types`.

export type OfficerMemberState = {
  /** Error code for the last failed attempt, or null before the first attempt. */
  error: string | null;
  /** Counts failed attempts, so the form can rebuild its date fields from `values`. */
  attempt: number;
  /** The submitted text and tick boxes, by field name. */
  values: Record<string, string>;
  /** Set once the membership has been added, so the drawer can show what happened. */
  created: OfficerMemberCreated | null;
};

export type OfficerMemberCreated = {
  memberId: string;
  name: string;
  planName: string;
  year: number;
  amountPence: number;
  paid: boolean;
  newsletter: boolean;
};

export const emptyOfficerMemberState: OfficerMemberState = { error: null, attempt: 0, values: {}, created: null };

/** A person already on the register who may be the same as the one being added. */
export type PossibleDuplicate = { id: string; name: string; state: string; matchedOn: "email" | "name and date of birth" | "name" };

export const guardianConsentMethods = {
  paper_form: "Signed paper form",
  in_person: "Agreed in person",
  phone: "Agreed by phone",
  other: "Other",
} as const;

export const newsletterConsentSources = {
  paper_form: "Ticked on the paper application form",
  in_person: "Asked in person",
  phone: "Asked by phone",
} as const;

/** The submitted fields as plain text, without the framework's hidden action fields or uploaded files. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$") || typeof value !== "string") continue;
    values[key] = value.slice(0, 1000);
  }
  return values;
}

/** What the Add an honorary member form sends back after a failed attempt. */
export type HonoraryMemberState = { error: string | null; attempt: number; values: Record<string, string> };

export const emptyHonoraryMemberState: HonoraryMemberState = { error: null, attempt: 0, values: {} };
