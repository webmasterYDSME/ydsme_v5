import "server-only";

import { createHash } from "node:crypto";
import { ensureMembershipPlanPrice } from "@/lib/membership";
import { londonDateParts } from "@/lib/membership-rules";
import { MemberListError, parseMemberList, type MemberListRow } from "@/lib/membermojo-list";
import { createServiceClient } from "@/lib/supabase/admin";

export class MemberImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberImportError";
  }
}

type PlanRow = {
  row_no: number;
  full_name: string;
  email: string | null;
  membership_type: string;
  plan_slug: string;
  plan_flag: "honorary" | "unrecognised" | null;
  member_id: string | null;
  member_state: string | null;
  shared_email: boolean;
  login_user_id: string | null;
  action: "add" | "renew" | "already_paid" | "skip";
  note: string | null;
};

export type ImportPreviewItem = { name: string; detail: string };

type RemovalRow = {
  member_id: string;
  full_name: string;
  email: string | null;
  plan_name: string | null;
  member_state: string;
  has_login: boolean;
  decision: "archive" | "keep_role" | "keep_hold" | "keep_state" | "keep_name";
  note: string | null;
};

export type RemovalItem = { name: string; email: string | null; plan: string | null; state: string; hasLogin: boolean; detail: string | null };

/**
 * A big clear-out is more likely to be the wrong file than a real change, so from this many people (or a fifth
 * of the register) the administrator has to type the number before it is saved.
 */
export const ARCHIVE_CONFIRMATION_FROM = 10;
export const archiveNeedsTypedConfirmation = (count: number, register: number) =>
  count >= ARCHIVE_CONFIRMATION_FROM || (count > 0 && count * 5 > register);

export type MemberImportPreview = {
  year: number;
  fileSha256: string;
  columnsUsed: string[];
  notActive: number;
  /** MemberMojo only records month and year of birth. */
  birthMonthOnly: boolean;
  totals: {
    people: number;
    add: number;
    /** Of the people added, how many become lifetime honorary members (no fee). */
    honorary: number;
    renew: number;
    alreadyPaid: number;
    skipped: number;
    loginsToLink: number;
    needInvitation: number;
    /** People being added or renewed who have no date of birth. */
    noBirthDate: number;
    /** People being added or renewed with a date of birth that could not be read. */
    unreadableBirthDates: number;
    withPhone: number;
    withAddress: number;
    withTitle: number;
    /** New people who will be subscribed to the newsletter. */
    newsletter: number;
    /** Members on the register who are not in the file and will be archived. */
    archive: number;
    /** Members an earlier import archived who are back in the file and will be restored. */
    restored: number;
    /** Not in the file, but never archived automatically. */
    kept: number;
  };
  /** Members who will be archived because they are not in the file. */
  toArchive: RemovalItem[];
  /** Members not in the file who are left as they are, with the reason. */
  kept: RemovalItem[];
  /** Set when the administrator must type this number to save: the archive is large. */
  archiveConfirmation: number | null;
  /** Things worth a look, none of which stop the import. */
  flagged: ImportPreviewItem[];
  skipped: ImportPreviewItem[];
};

export type MemberImportResult = {
  added: number;
  renewed: number;
  alreadyPaid: number;
  skipped: number;
  loginsLinked: number;
  needInvitation: number;
  detailsFilled: number;
  honorary: number;
  newsletter: number;
  archived: number;
  restored: number;
};

export function currentMembershipYear(now = new Date()) {
  return londonDateParts(now).year;
}

const toJson = (rows: MemberListRow[]) => rows.map((row) => ({
  full_name: row.fullName, email: row.email, membership_type: row.membershipType,
  title: row.title, date_of_birth: row.dateOfBirth, contact_number: row.phone,
  group_email_unsubscribed: row.groupEmailUnsubscribed,
  address_line_one: row.addressLineOne, address_line_two: row.addressLineTwo, city: row.city, postcode: row.postcode,
}));

async function planRows(rows: MemberListRow[], year: number) {
  const { data, error } = await createServiceClient().rpc("membermojo_import_plan", {
    p_rows: toJson(rows), p_year: year,
  });
  if (error || !Array.isArray(data)) throw new MemberImportError("We could not check this file. Nothing was changed.");
  return data as PlanRow[];
}

async function removalRows(rows: MemberListRow[]) {
  const { data, error } = await createServiceClient().rpc("membermojo_import_removals", { p_rows: toJson(rows) });
  if (error || !Array.isArray(data)) throw new MemberImportError("We could not check this file. Nothing was changed.");
  return data as RemovalRow[];
}

const removalItem = (row: RemovalRow): RemovalItem => ({
  name: row.full_name, email: row.email, plan: row.plan_name, state: row.member_state, hasLogin: row.has_login, detail: row.note,
});

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function buildMemberListPreview(bytes: Uint8Array): Promise<MemberImportPreview> {
  const parsed = parseMemberList(bytes);
  const year = currentMembershipYear();
  const [plan, removals] = await Promise.all([planRows(parsed.rows, year), removalRows(parsed.rows)]);
  const toArchive = removals.filter((row) => row.decision === "archive");
  const kept = removals.filter((row) => row.decision !== "archive");
  const register = removals.length + new Set(plan.map((row) => row.member_id).filter(Boolean)).size;
  const count = (action: PlanRow["action"]) => plan.filter((row) => row.action === action).length;
  const flagged: ImportPreviewItem[] = [];
  for (const row of plan) {
    if (row.action === "skip") continue;
    if (row.action === "renew" && row.member_state === "archived") flagged.push({ name: row.full_name, detail: "An earlier import archived them because they were missing from the list. They are back in it, so they are restored." });
    if (row.plan_flag === "unrecognised") flagged.push({ name: row.full_name, detail: `Type "${row.membership_type || "(blank)"}" was not recognised and is imported as an Adult member.` });
    if (!row.email) flagged.push({ name: row.full_name, detail: "No email address. They are added without a website login and cannot be invited." });
    else if (row.shared_email) flagged.push({ name: row.full_name, detail: "Shares an email address with another person. They are added without a website login." });
    else if (row.plan_slug === "junior") flagged.push({ name: row.full_name, detail: "Junior member. Juniors do not get their own website login." });
    const person = parsed.rows[row.row_no - 1];
    if (!person.dateOfBirth && row.plan_flag !== "honorary") {
      const consequence = row.plan_slug === "junior" ? "They will not move to Adult automatically at 18, and there is no way to check they are still eligible."
        : row.plan_slug === "student" ? "They will not move to Adult automatically at 25."
        : row.plan_slug === "adult" || row.plan_slug === "concession" ? "Automatic moves between Adult and Concession will not happen for them."
        : "";
      flagged.push({ name: row.full_name, detail: `No date of birth. ${consequence} Add it on their record when you have it.`.replace("  ", " ") });
    }
  }
  const done = plan.filter((row) => row.action !== "skip");
  const doneRows = done.map((row) => parsed.rows[row.row_no - 1]);
  const needInvitation = done.filter((row) => row.email && !row.shared_email && row.plan_slug !== "junior" && !row.login_user_id).length;
  return {
    year,
    fileSha256: sha256Hex(bytes),
    columnsUsed: parsed.columnsUsed,
    notActive: parsed.notActive,
    birthMonthOnly: parsed.birthMonthOnly,
    totals: {
      people: plan.length,
      add: count("add"),
      honorary: plan.filter((row) => row.action === "add" && row.plan_flag === "honorary").length,
      renew: count("renew"),
      alreadyPaid: count("already_paid"),
      skipped: count("skip"),
      loginsToLink: done.filter((row) => row.login_user_id && !row.member_id).length,
      needInvitation,
      noBirthDate: doneRows.filter((person) => !person.dateOfBirth).length,
      unreadableBirthDates: parsed.unreadableBirthDates,
      withPhone: doneRows.filter((person) => person.phone).length,
      withAddress: doneRows.filter((person) => person.addressLineOne || person.city || person.postcode).length,
      withTitle: doneRows.filter((person) => person.title).length,
      newsletter: done.filter((row) => row.action === "add" && row.email && row.plan_slug !== "junior"
        && parsed.rows[row.row_no - 1].groupEmailUnsubscribed === "no").length,
      archive: toArchive.length,
      restored: plan.filter((row) => row.action === "renew" && row.member_state === "archived").length,
      kept: kept.length,
    },
    toArchive: toArchive.map(removalItem),
    kept: kept.map(removalItem),
    archiveConfirmation: archiveNeedsTypedConfirmation(toArchive.length, register) ? toArchive.length : null,
    flagged: flagged.slice(0, 300),
    skipped: plan.filter((row) => row.action === "skip").map((row) => ({ name: row.full_name || "(no name)", detail: row.note ?? "Left out" })),
  };
}

/** The file is sent again for saving, and must be exactly the one that was checked. */
export async function applyMemberListImport(
  actorId: string, bytes: Uint8Array, expectedSha256: string, typedArchiveCount = "",
): Promise<MemberImportResult> {
  const fileSha256 = sha256Hex(bytes);
  if (fileSha256 !== expectedSha256) throw new MemberListError("This is not the same file that was checked. Choose the same file again, or check the new one first.");
  const rows = parseMemberList(bytes).rows;
  const year = currentMembershipYear();
  const [plan, removals] = await Promise.all([planRows(rows, year), removalRows(rows)]);
  const archiveCount = removals.filter((row) => row.decision === "archive").length;
  const register = removals.length + new Set(plan.map((row) => row.member_id).filter(Boolean)).size;
  if (archiveNeedsTypedConfirmation(archiveCount, register) && typedArchiveCount.trim() !== String(archiveCount)) {
    throw new MemberImportError(`${archiveCount} members would be archived. Type ${archiveCount} in the box to confirm, or check that this is the right file.`);
  }
  const slugs = [...new Set(plan.filter((row) => row.action !== "skip").map((row) => row.plan_slug))];
  if (slugs.length) {
    const { data: plans, error } = await createServiceClient().from("membership_plans").select("id,slug").in("slug", slugs);
    if (error || !plans || plans.length !== slugs.length) throw new MemberImportError("A membership plan needed for this list is missing. Nothing was changed.");
    for (const membershipPlan of plans) {
      try { await ensureMembershipPlanPrice(membershipPlan.id as string, year); }
      catch { throw new MemberImportError(`No annual fee is set for ${membershipPlan.slug} membership in ${year}. Set the fee first. Nothing was changed.`); }
    }
  }
  const { data, error } = await createServiceClient().rpc("apply_membermojo_import", {
    p_actor_id: actorId, p_rows: toJson(rows), p_year: year, p_file_sha256: fileSha256,
  });
  if (error || !data) {
    if (error?.message.includes("membermojo_import_price_missing")) throw new MemberImportError("A membership fee is missing for this year. Nothing was changed.");
    throw new MemberImportError("We could not save the member list. Nothing was changed.");
  }
  const result = data as Record<string, number>;
  return {
    added: result.added ?? 0, renewed: result.renewed ?? 0, alreadyPaid: result.already_paid ?? 0,
    skipped: result.skipped ?? 0, loginsLinked: result.logins_linked ?? 0, needInvitation: result.needs_invitation ?? 0,
    detailsFilled: result.details_filled ?? 0,
    honorary: result.honorary ?? 0,
    newsletter: result.newsletter ?? 0,
    archived: result.archived ?? 0,
    restored: result.restored ?? 0,
  };
}

export type MemberInvitationStatus = {
  enabled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastRunAt: string | null;
  /** Set while the run is waiting for Supabase Auth's hourly email limit to reset. */
  pausedUntil: string | null;
  sent: number;
  linked: number;
  failed: number;
  lastError: string | null;
  /** People still to invite (fewer than five failed attempts). */
  pending: number;
  /** People whose invitation failed five times; starting again tries them again. */
  gaveUp: number;
};

/** Progress of the background run that invites imported members to the website. */
export async function getMemberInvitationStatus(): Promise<MemberInvitationStatus> {
  const { data, error } = await createServiceClient().rpc("member_invitation_status");
  if (error || !data) throw new Error("Unable to read the website invitation progress.");
  const status = data as Record<string, unknown>;
  const number = (value: unknown) => Number(value ?? 0);
  const text = (value: unknown) => typeof value === "string" && value ? value : null;
  return {
    enabled: status.enabled === true,
    startedAt: text(status.started_at), finishedAt: text(status.finished_at), lastRunAt: text(status.last_run_at),
    pausedUntil: text(status.paused_until),
    sent: number(status.sent), linked: number(status.linked), failed: number(status.failed),
    lastError: text(status.last_error),
    pending: number(status.pending), gaveUp: number(status.gave_up),
  };
}
