import { withSupabase } from "@supabase/server";
import JSZip from "npm:jszip@3.10.1";

const PAGE_SIZE = 1_000;
const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const rowsToCsv = (rows: Array<Record<string, unknown>>) => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!headers.length) return "\uFEFF";
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`;
};

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    const { data: expiredReports } = await context.supabaseAdmin.from("membership_report_exports")
      .select("id,storage_path").eq("status", "ready").lt("expires_at", new Date().toISOString()).limit(100);
    const expiredPaths = (expiredReports ?? []).flatMap((report) => report.storage_path ? [report.storage_path] : []);
    if (expiredPaths.length) await context.supabaseAdmin.storage.from("membership-reports").remove(expiredPaths);
    if (expiredReports?.length) await context.supabaseAdmin.from("membership_report_exports").update({ status: "expired" })
      .in("id", expiredReports.map((report) => report.id));
    const { data: claims, error: claimError } = await context.supabaseAdmin.rpc("claim_membership_report_export");
    const claim = claims?.[0];
    if (claimError) return Response.json({ ok: false }, { status: 500 });
    if (!claim) return Response.json({ ok: true, generated: 0 });
    try {
      const load = async (table: string, columns: string, orderColumn = "created_at") => {
        const rows: Array<Record<string, unknown>> = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await context.supabaseAdmin.from(table).select(columns)
            .order(orderColumn, { ascending: true }).range(offset,offset+PAGE_SIZE-1);
          if (error) throw new Error(`Unable to read ${table}: ${error.message}`);
          rows.push(...(data ?? []));
          if ((data?.length ?? 0)<PAGE_SIZE) return rows;
        }
      };
      const [members,applications,terms,payments,honorary,audits,transitions,suppressions] = await Promise.all([
        load("members","id,legacy_external_id,full_name,title,contact_email,contact_email_verified_at,contact_role,contact_number,date_of_birth,effective_state,current_plan_id,auth_user_id,portal_invitation_status,joined_on,source,newsletter_opt_in,guardian_authority_ended_at,legal_hold,retention_until,created_at,updated_at"),
        load("membership_applications","id,full_name,title,contact_email,contact_role,guardian_led,contact_number,date_of_birth,requested_plan_id,payment_method,status,student_declaration,guardian_name,guardian_email,guardian_consent,guardian_verified_at,reviewed_at,review_reason,terms_version,terms_accepted_at,newsletter_opt_in,created_at,updated_at"),
        load("membership_terms","id,member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source,application_id,expected_payment_method,created_at,updated_at"),
        load("membership_payments","id,term_id,method,status,amount_pence,refunded_pence,currency,offline_reference,stripe_checkout_session_id,stripe_payment_intent_id,stripe_invoice_id,stripe_charge_id,received_at,cleared_at,recorded_by_actor_id,created_at,updated_at"),
        load("honorary_memberships","id,member_id,status,effective_from,reason,granted_by_actor_id,granted_at,revoked_effective_on,revocation_reason,replacement_plan_id,revoked_by_actor_id,revoked_at,created_at,updated_at"),
        load("audit_logs","id,actor_id,actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state,occurred_at","occurred_at"),
        load("membership_plan_transitions","id,member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on,requested_at,reviewed_by_actor_id,reviewed_at,review_reason,created_at,updated_at"),
        load("membership_email_suppressions","normalized_email,newsletter_suppressed,transactional_suppressed,reason,updated_at","updated_at"),
      ]);
      const membershipAudits = audits.filter((row) => String(row.action ?? "").startsWith("membership."));
      const sharedContacts = members.filter((row) => ["guardian","shared_household"].includes(String(row.contact_role)));
      const newsletterAddresses = [...new Map(members.filter((row) => row.newsletter_opt_in && row.contact_email)
        .map((row) => [String(row.contact_email).toLowerCase(), { email: String(row.contact_email).toLowerCase() }])).values()]
        .filter((row) => !suppressions.some((item) => item.normalized_email===row.email && item.newsletter_suppressed));
      const files: Record<string,string> = {
        "member-register.csv":rowsToCsv(members),"applications-and-declarations.csv":rowsToCsv(applications),
        "membership-terms.csv":rowsToCsv(terms),"payments-and-reversals.csv":rowsToCsv(payments),
        "honorary-history.csv":rowsToCsv(honorary),"plan-transitions.csv":rowsToCsv(transitions),
        "officer-audit-history.csv":rowsToCsv(membershipAudits),"shared-contact-and-portal-status.csv":rowsToCsv(sharedContacts),
        "newsletter-mailing-addresses.csv":rowsToCsv(newsletterAddresses),"email-suppressions.csv":rowsToCsv(suppressions),
      };
      const totals = payments.reduce((sum,row) => ({
        gross_pence:sum.gross_pence+Number(row.amount_pence ?? 0),
        refunded_pence:sum.refunded_pence+Number(row.refunded_pence ?? 0),
      }),{gross_pence:0,refunded_pence:0});
      const manifest = { generated_at:new Date().toISOString(),export_id:claim.export_id,filters:claim.filters,
        row_counts:Object.fromEntries(Object.entries(files).map(([name,content]) => [name,Math.max(0,content.split("\r\n").length-2)])),
        financial_totals_pence:{...totals,net_pence:totals.gross_pence-totals.refunded_pence},currency:"GBP" };
      const zip = new JSZip();
      Object.entries(files).forEach(([name,content]) => zip.file(name,content));
      zip.file("manifest.json",`${JSON.stringify(manifest,null,2)}\n`);
      const archive = await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
      const path = `${claim.export_id}/membership-records-${new Date().toISOString().slice(0,10)}.zip`;
      const { error: uploadError } = await context.supabaseAdmin.storage.from("membership-reports")
        .upload(path,archive,{contentType:"application/zip",upsert:true});
      if (uploadError) throw new Error("Unable to store membership report.");
      await context.supabaseAdmin.from("membership_report_exports").update({ status:"ready",storage_path:path,
        row_counts:manifest.row_counts,financial_totals:manifest.financial_totals_pence,completed_at:new Date().toISOString(),
        expires_at:new Date(Date.now()+24*60*60*1000).toISOString() }).eq("id",claim.export_id);
      return Response.json({ok:true,generated:1});
    } catch (error) {
      console.error("Membership report generation failed.", error instanceof Error ? error.message : "Unknown failure.");
      await context.supabaseAdmin.from("membership_report_exports").update({ status:"failed",
        last_error:"The complete membership report could not be generated.",completed_at:new Date().toISOString() }).eq("id",claim.export_id);
      return Response.json({ok:false},{status:500});
    }
  }),
};
