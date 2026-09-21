import { getCurrentUser, getRole, hasCapability } from "@/lib/auth";
import { membershipAdministrationEnabled } from "@/lib/features";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const privateResponse = (message: string, status: number) => new Response(message, { status, headers: privateHeaders });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return privateResponse("Unauthorised", 401);
  if (!(await membershipAdministrationEnabled())) return privateResponse("Forbidden", 403);
  const admin = createServiceClient();
  const [role, profileResult, officerResult] = await Promise.all([
    getRole(user.id),
    admin.from("users").select("membership_status").eq("id", user.id).maybeSingle(),
    admin.from("user_capabilities").select("user_id").eq("user_id", user.id).eq("capability", "memberships.manage").maybeSingle(),
  ]);
  const authorised = profileResult.data?.membership_status === "active"
    && (hasCapability(role, "memberships.manage") || (role === "committee" && Boolean(officerResult.data)));
  if (!authorised) return privateResponse("Forbidden", 403);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return privateResponse("Report not found", 404);
  const { data: report } = await admin.from("membership_report_exports")
    .select("storage_path,status,expires_at").eq("id", id).maybeSingle();
  if (!report?.storage_path || report.status !== "ready" || !report.expires_at || new Date(report.expires_at) <= new Date()) {
    return privateResponse("Report is not ready or has expired", 404);
  }
  const { data, error } = await admin.storage.from("membership-reports").download(report.storage_path);
  if (error || !data) return privateResponse("Report unavailable", 500);
  return new Response(data, { headers: {
    ...privateHeaders,
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="membership-records-${new Date().toISOString().slice(0, 10)}.zip"`,
  } });
}
