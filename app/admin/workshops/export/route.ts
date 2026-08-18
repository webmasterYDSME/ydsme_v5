import { getCurrentUser, getRole, hasCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!hasCapability(await getRole(user.id), "workshops.manage")) return new Response("Forbidden", { status: 403 });
  const workshopId = new URL(request.url).searchParams.get("workshop");
  if (!workshopId || !/^[0-9a-f-]{36}$/i.test(workshopId)) return new Response("Invalid workshop", { status: 400 });
  const admin = createAdminClient();
  const [{ data: workshop }, { data: reservations, error }] = await Promise.all([
    admin.from("workshops").select("title,date,start_time,venue").eq("id", workshopId).maybeSingle(),
    admin.from("participants").select("participant_id,created_at").eq("reference_id", workshopId).eq("reservation_status", "reserved").order("created_at"),
  ]);
  if (error || !workshop) return new Response("Workshop not found", { status: 404 });
  const ids = (reservations ?? []).map(item => item.participant_id);
  const memberResult = ids.length ? await admin.from("users").select("id,full_name,email,contact_number").in("id", ids) : { data: [] };
  const members = new Map((memberResult.data ?? []).map(member => [member.id, member]));
  const rows = [["Workshop", "Date", "Time", "Venue", "Member", "Email", "Contact", "Reserved at"], ...(reservations ?? []).map(item => { const member = members.get(item.participant_id); return [workshop.title, workshop.date, workshop.start_time.slice(0, 5), workshop.venue, member?.full_name, member?.email, member?.contact_number, item.created_at]; })];
  return new Response(rows.map(row => row.map(csv).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="workshop-roster-${workshop.date}.csv"`, "Cache-Control": "private, no-store" } });
}
