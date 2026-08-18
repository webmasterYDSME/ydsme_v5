import "server-only";

import { createHash } from "node:crypto";
import { parseMemberMojoCsv, type MemberMojoIssue, type MemberMojoRecord } from "@/lib/membermojo-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database";

export const memberImportModes = ["update_only", "complete_active_snapshot"] as const;
export type MemberImportMode = (typeof memberImportModes)[number];

export type MemberImportPreviewRow = {
  rowNumber: number;
  externalId: string;
  memberName: string;
  sourceState: string;
  expiresOn: string | null;
  outcome: "new" | "changed" | "unchanged";
  changedFields: string[];
  portalMatch: "already-linked" | "candidate" | "none" | "shared-email";
};

export type MemberImportPreview = {
  importId: string;
  canApply: boolean;
  expiresAt: string;
  fileFingerprint: string;
  mode: MemberImportMode;
  encoding: "utf-8" | "windows-1252";
  ignoredHeaders: string[];
  totals: {
    uploadedRows: number;
    activeRows: number;
    existingRecords: number;
    newRecords: number;
    changedRecords: number;
    unchangedRecords: number;
    alreadyLinked: number;
    portalLinkCandidates: number;
    missingFromSnapshot: number;
    warnings: number;
    information: number;
  };
  rows: MemberImportPreviewRow[];
  rowsTruncated: boolean;
  issues: MemberMojoIssue[];
  issuesTruncated: boolean;
};

export type AppliedMemberImport = {
  processedCount: number;
  createdCount: number;
  refreshedCount: number;
};

export class MemberMojoImportApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberMojoImportApplyError";
  }
}

type ExistingMembership = {
  external_id: string;
  auth_user_id: string | null;
  title: string;
  first_name: string;
  last_name: string;
  contact_email: string | null;
  membership_type: string;
  source_state: string;
  source_expires_on: string | null;
  source_renewed_on: string | null;
  source_member_since: string | null;
  source_rules_agreement: boolean | null;
};

const comparedFields: Array<{
  label: string;
  source: keyof MemberMojoRecord;
  existing: keyof ExistingMembership;
}> = [
  { label: "title", source: "title", existing: "title" },
  { label: "first name", source: "firstName", existing: "first_name" },
  { label: "last name", source: "lastName", existing: "last_name" },
  { label: "contact email", source: "contactEmail", existing: "contact_email" },
  { label: "membership type", source: "membershipType", existing: "membership_type" },
  { label: "membership state", source: "sourceState", existing: "source_state" },
  { label: "expiry date", source: "expiresOn", existing: "source_expires_on" },
  { label: "renewal date", source: "renewedOn", existing: "source_renewed_on" },
  { label: "member-since date", source: "memberSince", existing: "source_member_since" },
  { label: "rules agreement", source: "rulesAgreement", existing: "source_rules_agreement" },
];

function normalizedEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function changedFields(record: MemberMojoRecord, existing: ExistingMembership) {
  return comparedFields
    .filter(field => {
      const sourceValue = field.source === "contactEmail"
        ? normalizedEmail(record.contactEmail)
        : record[field.source];
      const existingValue = field.existing === "contact_email"
        ? normalizedEmail(existing.contact_email)
        : existing[field.existing];
      return sourceValue !== existingValue;
    })
    .map(field => field.label);
}

export async function buildMemberMojoPreview(
  bytes: Uint8Array,
  mode: MemberImportMode,
  actorId: string,
): Promise<MemberImportPreview> {
  const parsed = parseMemberMojoCsv(bytes);
  const admin = createAdminClient();
  const externalIds = parsed.records.map(record => record.externalId);

  const membershipResults = await Promise.all(chunks(externalIds, 150).map(ids => admin
    .from("membership_records")
    .select("external_id,auth_user_id,title,first_name,last_name,contact_email,membership_type,source_state,source_expires_on,source_renewed_on,source_member_since,source_rules_agreement")
    .eq("source", "membermojo")
    .in("external_id", ids)));
  if (membershipResults.some(result => result.error)) throw new Error("Unable to compare the file with membership records.");
  const existingData = membershipResults.flatMap(result => result.data ?? []);

  const existing = new Map((existingData ?? []).map(record => [record.external_id, record]));
  const emailCounts = new Map<string, number>();
  for (const record of parsed.records) {
    const email = normalizedEmail(record.contactEmail);
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }
  const uniqueEmails = [...emailCounts].filter(([, count]) => count === 1).map(([email]) => email);
  const portalResults = await Promise.all(chunks(uniqueEmails, 100).map(emails => admin
    .from("users")
    .select("id,email")
    .in("email", emails)));
  if (portalResults.some(result => result.error)) throw new Error("Unable to compare the file with portal accounts.");
  const portalUsers = portalResults.flatMap(result => result.data ?? []);

  const portalByEmail = new Map<string, string[]>();
  for (const user of portalUsers) {
    const email = normalizedEmail(user.email);
    if (!email) continue;
    portalByEmail.set(email, [...(portalByEmail.get(email) ?? []), user.id]);
  }

  const rows: MemberImportPreviewRow[] = parsed.records.map(record => {
    const current = existing.get(record.externalId);
    const changes = current ? changedFields(record, current) : [];
    const email = normalizedEmail(record.contactEmail);
    const matches = email ? portalByEmail.get(email) ?? [] : [];
    let portalMatch: MemberImportPreviewRow["portalMatch"] = "none";
    if (current?.auth_user_id) portalMatch = "already-linked";
    else if (email && (emailCounts.get(email) ?? 0) > 1) portalMatch = "shared-email";
    else if (matches.length === 1) portalMatch = "candidate";

    return {
      rowNumber: record.rowNumber,
      externalId: record.externalId,
      memberName: record.displayName,
      sourceState: record.sourceState,
      expiresOn: record.expiresOn,
      outcome: !current ? "new" : changes.length ? "changed" : "unchanged",
      changedFields: changes,
      portalMatch,
    };
  });

  let missingFromSnapshot = 0;
  if (mode === "complete_active_snapshot") {
    const { data, error } = await admin
      .from("membership_records")
      .select("external_id")
      .eq("source", "membermojo")
      .ilike("source_state", "active");
    if (error) throw new Error("Unable to identify members absent from the snapshot.");
    const uploadedIds = new Set(externalIds);
    missingFromSnapshot = (data ?? []).filter(record => !uploadedIds.has(record.external_id)).length;
  }

  const issueLimit = 150;
  const rowLimit = 150;
  const reviewRows = rows.filter(row => row.outcome !== "unchanged");
  const totals: MemberImportPreview["totals"] = {
    uploadedRows: rows.length,
    activeRows: parsed.records.filter(record => record.sourceState.toLowerCase() === "active").length,
    existingRecords: rows.filter(row => row.outcome !== "new").length,
    newRecords: rows.filter(row => row.outcome === "new").length,
    changedRecords: rows.filter(row => row.outcome === "changed").length,
    unchangedRecords: rows.filter(row => row.outcome === "unchanged").length,
    alreadyLinked: rows.filter(row => row.portalMatch === "already-linked").length,
    portalLinkCandidates: rows.filter(row => row.portalMatch === "candidate").length,
    missingFromSnapshot,
    warnings: parsed.issues.filter(issue => issue.severity === "warning").length,
    information: parsed.issues.filter(issue => issue.severity === "information").length,
  };
  const issueCounts = Object.fromEntries([...new Set(parsed.issues.map(issue => issue.code))]
    .map(code => [code, parsed.issues.filter(issue => issue.code === code).length]));
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: registrationData, error: registrationError } = await admin.rpc("register_membermojo_import_preview", {
    p_actor_id: actorId,
    p_file_sha256: fileSha256,
    p_import_mode: mode,
    p_row_count: rows.length,
    p_source_encoding: parsed.encoding,
    p_summary: {
      totals,
      ignored_column_count: parsed.ignoredHeaders.length,
      issue_counts: issueCounts,
    },
  });
  const registration = registrationData?.[0];
  if (registrationError || !registration) throw new Error("Unable to register the import preview.");

  return {
    importId: registration.import_id,
    canApply: registration.import_status === "previewed",
    expiresAt: registration.import_expires_at,
    fileFingerprint: fileSha256.slice(0, 12),
    mode,
    encoding: parsed.encoding,
    ignoredHeaders: parsed.ignoredHeaders,
    totals,
    rows: reviewRows.slice(0, rowLimit),
    rowsTruncated: reviewRows.length > rowLimit,
    issues: parsed.issues.slice(0, issueLimit),
    issuesTruncated: parsed.issues.length > issueLimit,
  };
}

function safeApplyMessage(message: string) {
  if (message.includes("membermojo_import_already_applied")) return "This MemberMojo file has already been applied.";
  if (message.includes("membermojo_preview_expired")) return "This preview has expired. Create a new preview before applying the file.";
  if (message.includes("membermojo_file_changed")) return "The selected file is not the file used for this preview.";
  if (message.includes("membermojo_preview_not_found")) return "This preview is unavailable or belongs to another administrator.";
  return "The membership import could not be applied. No membership records were changed.";
}

export async function applyMemberMojoMembershipImport(
  bytes: Uint8Array,
  importId: string,
  actorId: string,
): Promise<AppliedMemberImport> {
  const parsed = parseMemberMojoCsv(bytes);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const records = parsed.records.map(record => ({
    external_id: record.externalId,
    title: record.title,
    first_name: record.firstName,
    last_name: record.lastName,
    contact_email: record.contactEmail,
    membership_type: record.membershipType,
    source_state: record.sourceState,
    source_expires_on: record.expiresOn,
    source_renewed_on: record.renewedOn,
    source_member_since: record.memberSince,
    source_rules_agreement: record.rulesAgreement,
  })) as Json;
  const { data, error } = await createAdminClient().rpc("apply_membermojo_membership_import", {
    p_actor_id: actorId,
    p_file_sha256: fileSha256,
    p_import_id: importId,
    p_records: records,
  });
  const result = data?.[0];
  if (error || !result) throw new MemberMojoImportApplyError(safeApplyMessage(error?.message ?? "missing result"));
  return {
    processedCount: result.processed_count,
    createdCount: result.created_count,
    refreshedCount: result.refreshed_count,
  };
}
