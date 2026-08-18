export const MEMBERMOJO_MAX_FILE_BYTES = 750_000;
export const MEMBERMOJO_MAX_ROWS = 1000;

export const MEMBERMOJO_REQUIRED_HEADERS = [
  "Title",
  "First name",
  "Last name",
  "Email",
  "Membership",
  "By ticking this box you agree to abide by the Rules of the Club",
  "Expires on",
  "Renewed on",
  "Member since",
  "Site role",
  "Membership state",
  "membermojo ID",
] as const;

export type MemberMojoEncoding = "utf-8" | "windows-1252";
export type MemberMojoIssueSeverity = "error" | "warning" | "information";

export type MemberMojoIssue = {
  rowNumber: number | null;
  severity: MemberMojoIssueSeverity;
  code: string;
  memberName: string | null;
  externalId: string | null;
  message: string;
};

export type MemberMojoRecord = {
  rowNumber: number;
  externalId: string;
  title: string;
  firstName: string;
  lastName: string;
  displayName: string;
  contactEmail: string | null;
  membershipType: string;
  sourceState: string;
  expiresOn: string | null;
  renewedOn: string | null;
  memberSince: string | null;
  rulesAgreement: boolean | null;
  sourceSiteRole: string;
};

export type ParsedMemberMojoCsv = {
  encoding: MemberMojoEncoding;
  headers: string[];
  ignoredHeaders: string[];
  records: MemberMojoRecord[];
  issues: MemberMojoIssue[];
};

export class MemberMojoCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberMojoCsvError";
  }
}

function decodeCsv(bytes: Uint8Array): { encoding: MemberMojoEncoding; source: string } {
  try {
    return { encoding: "utf-8", source: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { encoding: "windows-1252", source: new TextDecoder("windows-1252").decode(bytes) };
  }
}

function csvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  const input = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value.length) throw new MemberMojoCsvError("One entry has a quotation mark in the wrong place. Download a fresh file from MemberMojo and try again.");
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new MemberMojoCsvError("One entry has an unfinished quotation. Download a fresh file from MemberMojo and try again.");
  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function bounded(value: string, label: string, maximum: number, rowNumber: number) {
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new MemberMojoCsvError(`${label} on row ${rowNumber} is longer than ${maximum} characters.`);
  }
  return normalized;
}

function sourceDate(value: string, label: string, rowNumber: number) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new MemberMojoCsvError(`${label} on line ${rowNumber} must look like 2026-12-31.`);
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new MemberMojoCsvError(`${label} on line ${rowNumber} is not a real date.`);
  }
  return normalized;
}

function agreement(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes") return true;
  if (normalized === "no") return false;
  return null;
}

function issueFor(record: MemberMojoRecord, issue: Omit<MemberMojoIssue, "rowNumber" | "memberName" | "externalId">): MemberMojoIssue {
  return {
    ...issue,
    rowNumber: record.rowNumber,
    memberName: record.displayName,
    externalId: record.externalId,
  };
}

export function parseMemberMojoCsv(bytes: Uint8Array, today = new Date().toISOString().slice(0, 10)): ParsedMemberMojoCsv {
  if (!bytes.byteLength) throw new MemberMojoCsvError("This file is empty. Choose a MemberMojo file that contains members.");
  if (bytes.byteLength > MEMBERMOJO_MAX_FILE_BYTES) {
    throw new MemberMojoCsvError("This file is too large. Choose a MemberMojo file with no more than 1,000 people.");
  }

  const { encoding, source } = decodeCsv(bytes);
  const rows = csvRows(source);
  if (rows.length < 2) throw new MemberMojoCsvError("This file does not contain any members.");

  const headers = rows[0].map(header => header.trim());
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new MemberMojoCsvError(`These column names appear more than once: ${[...new Set(duplicateHeaders)].join(", ")}.`);

  const missingHeaders = MEMBERMOJO_REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missingHeaders.length) throw new MemberMojoCsvError(`This file does not have these expected column headings: ${missingHeaders.join(", ")}. Download a fresh file from MemberMojo.`);
  if (rows.length - 1 > MEMBERMOJO_MAX_ROWS) throw new MemberMojoCsvError(`This file contains more than ${MEMBERMOJO_MAX_ROWS} people.`);

  const indexOf = (header: typeof MEMBERMOJO_REQUIRED_HEADERS[number]) => headers.indexOf(header);
  const issues: MemberMojoIssue[] = [];
  const records: MemberMojoRecord[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const rowNumber = index + 1;
    const get = (header: typeof MEMBERMOJO_REQUIRED_HEADERS[number]) => values[indexOf(header)] ?? "";
    const externalId = bounded(get("membermojo ID"), "MemberMojo ID", 20, rowNumber);
    if (!/^\d{1,20}$/.test(externalId)) throw new MemberMojoCsvError(`The MemberMojo ID on line ${rowNumber} is missing or does not look right.`);

    const firstName = bounded(get("First name"), "First name", 100, rowNumber);
    const lastName = bounded(get("Last name"), "Last name", 100, rowNumber);
    if (!firstName || !lastName) throw new MemberMojoCsvError(`The person on line ${rowNumber} needs both a first name and a last name.`);

    const emailValue = bounded(get("Email"), "Email", 254, rowNumber).toLowerCase();
    const contactEmail = emailValue || null;
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new MemberMojoCsvError(`The email address on line ${rowNumber} does not look right.`);
    }

    const rulesAgreementValue = get("By ticking this box you agree to abide by the Rules of the Club");
    const record: MemberMojoRecord = {
      rowNumber,
      externalId,
      title: bounded(get("Title"), "Title", 30, rowNumber),
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      contactEmail,
      membershipType: bounded(get("Membership"), "Membership", 120, rowNumber),
      sourceState: bounded(get("Membership state"), "Membership state", 50, rowNumber),
      expiresOn: sourceDate(get("Expires on"), "Expiry date", rowNumber),
      renewedOn: sourceDate(get("Renewed on"), "Renewal date", rowNumber),
      memberSince: sourceDate(get("Member since"), "Member-since date", rowNumber),
      rulesAgreement: agreement(rulesAgreementValue),
      sourceSiteRole: bounded(get("Site role"), "Site role", 60, rowNumber),
    };
    if (!record.membershipType || !record.sourceState) throw new MemberMojoCsvError(`The person on line ${rowNumber} needs a membership type and a membership status.`);
    if (rulesAgreementValue.trim() && record.rulesAgreement === null) {
      issues.push(issueFor(record, {
        severity: "warning",
        code: "unknown-rules-agreement",
        message: "The answer about agreeing to the club rules is unusual. Please check it.",
      }));
    }
    records.push(record);
  }

  const externalIdCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const record of records) {
    externalIdCounts.set(record.externalId, (externalIdCounts.get(record.externalId) ?? 0) + 1);
    if (record.contactEmail) emailCounts.set(record.contactEmail, (emailCounts.get(record.contactEmail) ?? 0) + 1);
  }
  const duplicateIds = [...externalIdCounts].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateIds.length) throw new MemberMojoCsvError(`The same MemberMojo ID appears more than once: ${duplicateIds.slice(0, 10).join(", ")}.`);

  for (const record of records) {
    if (!record.contactEmail) {
      issues.push(issueFor(record, { severity: "warning", code: "missing-email", message: "This person has no email address, so we cannot safely match them to a website account." }));
    } else if ((emailCounts.get(record.contactEmail) ?? 0) > 1) {
      issues.push(issueFor(record, { severity: "warning", code: "shared-email", message: "More than one person uses this email address, so we cannot safely choose a website account." }));
    }
    if (record.sourceState.toLowerCase() !== "active") {
      issues.push(issueFor(record, { severity: "warning", code: "unmapped-state", message: `The MemberMojo status “${record.sourceState}” is not one we use automatically. Please check it.` }));
    }
    if (record.sourceState.toLowerCase() === "active" && record.expiresOn && record.expiresOn < today) {
      issues.push(issueFor(record, { severity: "warning", code: "active-past-expiry", message: `MemberMojo says this person is Active, but their membership end date was ${record.expiresOn}.` }));
    }
    if (record.sourceState.toLowerCase() === "active" && !record.expiresOn) {
      issues.push(issueFor(record, { severity: "warning", code: "active-without-expiry", message: "MemberMojo says this person is Active, but there is no membership end date." }));
    }
    if (!/^member$/i.test(record.sourceSiteRole)) {
      issues.push(issueFor(record, { severity: "information", code: "source-role-ignored", message: `MemberMojo calls this person “${record.sourceSiteRole || "blank"}”. We do not use that label to change what they can do on this website.` }));
    }
  }

  return {
    encoding,
    headers,
    ignoredHeaders: headers.filter(header => !(MEMBERMOJO_REQUIRED_HEADERS as readonly string[]).includes(header)),
    records,
    issues,
  };
}
