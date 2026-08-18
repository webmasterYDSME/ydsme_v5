import { getCurrentUser, getRole, hasCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const role = await getRole(user.id);
  if (!hasCapability(role, "bookings.manage")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const eventId = /^\d+$/.test(url.searchParams.get("event") || "") ? Number(url.searchParams.get("event")) : null;
  const status = url.searchParams.get("status") || "active";
  const search = safeSearchTerm(url.searchParams.get("q"));
  let query = createAdminClient().from("event_bookings").select("reference_code,lead_name,email,party_size,status,created_at,event_id");
  if (eventId) query = query.eq("event_id", eventId);
  if (status === "active") query = query.in("status", ["confirmed", "checked_in"]);
  else if (["confirmed", "checked_in", "cancelled"].includes(status)) query = query.eq("status", status);
  if (search) query = query.or(`reference_code.ilike.%${search}%,lead_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(10_000);
  if (error) return new Response("Export unavailable", { status: 500 });
  const eventIds = [...new Set((data ?? []).map((row) => row.event_id))];
  const eventResult = eventIds.length
    ? await createAdminClient().from("events").select("id,name,start_date,start_time").in("id", eventIds)
    : { data: [], error: null };
  const eventMap = new Map((eventResult.data ?? []).map((event) => [event.id, event]));
  const rows = [
    ["Reference", "Name", "Email", "Party size", "Status", "Event", "Event date", "Event time", "Booked at"],
    ...(data ?? []).map((row) => {
      const event = eventMap.get(row.event_id);
      return [row.reference_code, row.lead_name, row.email, row.party_size, row.status, event?.name, event?.start_date, event?.start_time?.slice(0, 5), row.created_at];
    }),
  ];
  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="visitor-bookings-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
