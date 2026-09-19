// Reads a MemberMojo member-list CSV. The email address and the name (a "full_name" column, or
// MemberMojo's "First name" and "Last name") are required. If present, these are also read: the
// "Membership" type, Title, date of birth, Contact number, the address lines and the Postcode.
// If the file has a "Membership state" column, people who are not Active are left out.
// No imports, so it can be unit tested with `node --experimental-strip-types`.

export const MEMBER_LIST_MAX_BYTES = 750_000;
export const MEMBER_LIST_MAX_ROWS = 1000;

export type MemberListRow = {
  fullName: string;
  email: string;
  membershipType: string;
  title: string;
  /** YYYY-MM-DD, or "" when the file has none or it cannot be read. */
  dateOfBirth: string;
  phone: string;
  addressLineOne: string;
  addressLineTwo: string;
  city: string;
  postcode: string;
};

export type ParsedMemberList = {
  rows: MemberListRow[];
  /** People left out because MemberMojo did not mark them Active. */
  notActive: number;
  /** The columns that were read, for showing back to the officer. */
  columnsUsed: string[];
  /** MemberMojo only records the month and year of birth, so the day is always the 1st. */
  birthMonthOnly: boolean;
  /** Dates of birth that were filled in but could not be read (they are left blank). */
  unreadableBirthDates: number;
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

/** Accepts 2008-04-01 or 01/04/2008 (or 04/2008). Returns "" for anything else, a future date, or before 1900. */
export function readBirthDate(value: string, today = new Date()) {
  const text = value.trim();
  let year: number; let month: number; let day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) { year = Number(match[1]); month = Number(match[2]); day = Number(match[3]); }
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text))) { day = Number(match[1]); month = Number(match[2]); year = Number(match[3]); }
  else if ((match = /^(\d{1,2})\/(\d{4})$/.exec(text))) { day = 1; month = Number(match[1]); year = Number(match[2]); }
  else return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  if (year < 1900 || date.getTime() > today.getTime()) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** MemberMojo writes numbers as "t:01904 123456"; the label is dropped and spacing tidied. */
export function readPhone(value: string) {
  return clean(value).replace(/^[A-Za-z]{1,3}\s*:\s*/, "").slice(0, 40);
}

/** Upper case, one space before the last three characters when it looks like a UK postcode. */
export function readPostcode(value: string) {
  const compact = clean(value).toUpperCase().replace(/\s/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : clean(value).toUpperCase().slice(0, 12);
}

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
  const titleAt = at("title");
  const birthAt = at("month and year of birth", "date of birth", "date_of_birth", "dob", "birth date");
  const phoneAt = at("contact number", "phone", "telephone", "mobile", "phone number");
  const lineAts = [1, 2, 3, 4].map((number) => at(`address line ${number}`, `address_line_${number}`));
  const postcodeAt = at("postcode", "post code", "postal code");
  if (emailAt < 0) throw new MemberListError("This file has no Email column. Download the member list from MemberMojo again.");
  if (fullNameAt < 0 && (firstAt < 0 || lastAt < 0)) throw new MemberListError("This file needs a full_name column, or First name and Last name columns.");

  const people: MemberListRow[] = [];
  let notActive = 0;
  let unreadableBirthDates = 0;
  const lineOf = (values: string[], number: number) => (lineAts[number - 1] >= 0 ? clean(values[lineAts[number - 1]]).slice(0, 180) : "");
  for (const values of rows.slice(1)) {
    if (stateAt >= 0 && clean(values[stateAt]).toLowerCase() !== "active") { notActive += 1; continue; }
    const fullName = fullNameAt >= 0 ? clean(values[fullNameAt]) : clean(`${clean(values[firstAt])} ${clean(values[lastAt])}`);
    const email = clean(values[emailAt]).toLowerCase();
    const membershipType = typeAt >= 0 ? clean(values[typeAt]) : "";
    if (fullName.length > 180 || email.length > 254 || membershipType.length > 120) {
      throw new MemberListError("One name, email address or membership type in this file is too long. Check the file and try again.");
    }
    const title = titleAt >= 0 ? clean(values[titleAt]) : "";
    const rawBirth = birthAt >= 0 ? clean(values[birthAt]) : "";
    const dateOfBirth = rawBirth ? readBirthDate(rawBirth) : "";
    if (rawBirth && !dateOfBirth) unreadableBirthDates += 1;
    // The first line is the street. The last of the other lines is the town or county, and anything between goes on line two.
    const others = [lineOf(values, 2), lineOf(values, 3), lineOf(values, 4)].filter(Boolean);
    const city = others.length ? others[others.length - 1] : "";
    people.push({
      fullName, email, membershipType,
      title: title.length <= 30 ? title : "",
      dateOfBirth,
      phone: phoneAt >= 0 ? readPhone(values[phoneAt] ?? "") : "",
      addressLineOne: lineOf(values, 1),
      addressLineTwo: others.slice(0, -1).join(", ").slice(0, 180),
      city,
      postcode: postcodeAt >= 0 ? readPostcode(values[postcodeAt] ?? "") : "",
    });
  }
  if (!people.length) throw new MemberListError(notActive ? "Nobody in this file is marked Active." : "This file does not contain any members.");

  const columnsUsed = [
    fullNameAt >= 0 ? "full_name" : "First name and Last name",
    "Email",
    ...(typeAt >= 0 ? ["Membership"] : []),
    ...(stateAt >= 0 ? ["Membership state"] : []),
    ...(titleAt >= 0 ? ["Title"] : []),
    ...(birthAt >= 0 ? [clean(rows[0][birthAt])] : []),
    ...(phoneAt >= 0 ? ["Contact number"] : []),
    ...(lineAts.some((index) => index >= 0) || postcodeAt >= 0 ? ["Address"] : []),
  ];
  return {
    rows: people, notActive, columnsUsed, unreadableBirthDates,
    birthMonthOnly: birthAt >= 0 && /month/.test(headers[birthAt]),
  };
}
