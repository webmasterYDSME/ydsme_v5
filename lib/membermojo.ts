import "server-only";

import { createHash } from "node:crypto";
import { ensureMembershipPlanPrice } from "@/lib/membership";
import { londonDateParts } from "@/lib/membership-rules";
import { parseMemberList, type MemberListRow } from "@/lib/membermojo-list";
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

export type MemberImportPreview = {
  year: number;
  fileSha256: string;
  columnsUsed: string[];
  notActive: number;
  totals: {
    people: number;
    add: number;
    renew: number;
    alreadyPaid: number;
    skipped: number;
    loginsToLink: number;
    needInvitation: number;
  };
  /** Things worth a look, none of which stop the import. */
  flagged: ImportPreviewItem[];
  skipped: ImportPreviewItem[];
  /** What the apply step sends back to be saved. */
  rows: MemberListRow[];
};

export type MemberImportResult = {
  added: number;
  renewed: number;
  alreadyPaid: number;
  skipped: number;
  loginsLinked: number;
  needInvitation: number;
};

export function currentMembershipYear(now = new Date()) {
  return londonDateParts(now).year;
}

const toJson = (rows: MemberListRow[]) => rows.map((row) => ({
  full_name: row.fullName, email: row.email, membership_type: row.membershipType,
}));

async function planRows(rows: MemberListRow[], year: number) {
  const { data, error } = await createServiceClient().rpc("membermojo_import_plan", {
    p_rows: toJson(rows), p_year: year,
  });
  if (error || !Array.isArray(data)) throw new MemberImportError("We could not check this file. Nothing was changed.");
  return data as PlanRow[];
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function buildMemberListPreview(bytes: Uint8Array): Promise<MemberImportPreview> {
  const parsed = parseMemberList(bytes);
  const year = currentMembershipYear();
  const plan = await planRows(parsed.rows, year);
  const count = (action: PlanRow["action"]) => plan.filter((row) => row.action === action).length;
  const flagged: ImportPreviewItem[] = [];
  for (const row of plan) {
    if (row.action === "skip") continue;
    if (row.plan_flag === "honorary") flagged.push({ name: row.full_name, detail: `Type "${row.membership_type}" is imported as an Adult member. Change it on their record if it should be Honorary.` });
    else if (row.plan_flag === "unrecognised") flagged.push({ name: row.full_name, detail: `Type "${row.membership_type || "(blank)"}" was not recognised and is imported as an Adult member.` });
    if (!row.email) flagged.push({ name: row.full_name, detail: "No email address. They are added without a website login and cannot be invited." });
    else if (row.shared_email) flagged.push({ name: row.full_name, detail: "Shares an email address with another person. They are added without a website login." });
    else if (row.plan_slug === "junior") flagged.push({ name: row.full_name, detail: "Junior member. Juniors do not get their own website login." });
  }
  const done = plan.filter((row) => row.action !== "skip");
  const needInvitation = done.filter((row) => row.email && !row.shared_email && row.plan_slug !== "junior" && !row.login_user_id).length;
  return {
    year,
    fileSha256: sha256Hex(bytes),
    columnsUsed: parsed.columnsUsed,
    notActive: parsed.notActive,
    totals: {
      people: plan.length,
      add: count("add"),
      renew: count("renew"),
      alreadyPaid: count("already_paid"),
      skipped: count("skip"),
      loginsToLink: done.filter((row) => row.login_user_id && !row.member_id).length,
      needInvitation,
    },
    flagged: flagged.slice(0, 300),
    skipped: plan.filter((row) => row.action === "skip").map((row) => ({ name: row.full_name || "(no name)", detail: row.note ?? "Left out" })),
    rows: parsed.rows,
  };
}

export async function applyMemberListImport(actorId: string, rows: MemberListRow[], fileSha256: string): Promise<MemberImportResult> {
  const year = currentMembershipYear();
  const plan = await planRows(rows, year);
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
  };
}

/** Members added by an import who can be invited to the website but have not been yet. */
export async function countPendingInvitations() {
  const { count, error } = await createServiceClient().from("members")
    .select("id", { count: "exact", head: true })
    .eq("source", "membermojo_cutover").eq("portal_invitation_status", "eligible")
    .is("auth_user_id", null).not("contact_email", "is", null).is("anonymized_at", null);
  if (error) throw new Error("Unable to count website invitations still to send.");
  return count ?? 0;
}
