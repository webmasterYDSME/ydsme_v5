// Reads a MemberMojo member-list CSV. Only three things are used: the email address, the name (a
// "full_name" column, or MemberMojo's "First name" and "Last name") and, if present, the "Membership"
// type. If the file has a "Membership state" column, people who are not Active are left out.
// No imports, so it can be unit tested with `node --experimental-strip-types`.

export const MEMBER_LIST_MAX_BYTES = 750_000;
export const MEMBER_LIST_MAX_ROWS = 1000;

export type MemberListRow = { fullName: string; email: string; membershipType: string };

export type ParsedMemberList = {
  rows: MemberListRow[];
  /** People left out because MemberMojo did not mark them Active. */
  notActive: number;
  /** The columns that were read, for showing back to the officer. */
  columnsUsed: string[];
};

export class MemberListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberListError";
  }
}

function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
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
      if (character === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') {
      if (value.length) throw new MemberListError("One entry has a quotation mark in the wrong place. Download a fresh file from MemberMojo and try again.");
      quoted = true;
    } else if (character === ",") {
      row.push(value); value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new MemberListError("One entry has an unfinished quotation. Download a fresh file from MemberMojo and try again.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function parseMemberList(bytes: Uint8Array): ParsedMemberList {
  if (!bytes.byteLength) throw new MemberListError("This file is empty. Choose a MemberMojo file that contains members.");
  if (bytes.byteLength > MEMBER_LIST_MAX_BYTES) throw new MemberListError("This file is too large. Choose a file with no more than 1,000 people.");
  const rows = csvRows(decode(bytes));
  if (rows.length < 2) throw new MemberListError("This file does not contain any members.");
  if (rows.length - 1 > MEMBER_LIST_MAX_ROWS) throw new MemberListError(`This file contains more than ${MEMBER_LIST_MAX_ROWS} people.`);

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const at = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const emailAt = at("email", "email address");
  const fullNameAt = at("full_name", "full name", "name");
  const firstAt = at("first name", "first_name");
  const lastAt = at("last name", "last_name");
  const typeAt = at("membership", "membership type", "membership_type");
  const stateAt = at("membership state", "membership_state");
  if (emailAt < 0) throw new MemberListError("This file has no Email column. Download the member list from MemberMojo again.");
  if (fullNameAt < 0 && (firstAt < 0 || lastAt < 0)) throw new MemberListError("This file needs a full_name column, or First name and Last name columns.");

  const people: MemberListRow[] = [];
  let notActive = 0;
  for (const values of rows.slice(1)) {
    if (stateAt >= 0 && clean(values[stateAt]).toLowerCase() !== "active") { notActive += 1; continue; }
    const fullName = fullNameAt >= 0 ? clean(values[fullNameAt]) : clean(`${clean(values[firstAt])} ${clean(values[lastAt])}`);
    const email = clean(values[emailAt]).toLowerCase();
    const membershipType = typeAt >= 0 ? clean(values[typeAt]) : "";
    if (fullName.length > 180 || email.length > 254 || membershipType.length > 120) {
      throw new MemberListError("One name, email address or membership type in this file is too long. Check the file and try again.");
    }
    people.push({ fullName, email, membershipType });
  }
  if (!people.length) throw new MemberListError(notActive ? "Nobody in this file is marked Active." : "This file does not contain any members.");

  const columnsUsed = [
    fullNameAt >= 0 ? "full_name" : "First name and Last name",
    "Email",
    ...(typeAt >= 0 ? ["Membership"] : []),
    ...(stateAt >= 0 ? ["Membership state"] : []),
  ];
  return { rows: people, notActive, columnsUsed };
}
