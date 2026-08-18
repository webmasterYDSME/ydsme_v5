import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Ban, Download, MailCheck, RotateCcw, Search, TicketCheck, UserCheck, UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { cancelBooking, checkInBooking, resendBookingCancellation, resendBookingConfirmation, undoBookingCheckIn } from "@/lib/actions/bookings";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

type Query = { q?: string; event?: string; status?: string; page?: string; error?: string; notice?: string };

function searchValue(value?: string) {
  return safeSearchTerm(value);
}

function pageLink(query: Query, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.event) params.set("event", query.event);
  if (query.status) params.set("status", query.status);
  params.set("page", String(page));
  return `/admin/bookings?${params}`;
}

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query] = await Promise.all([searchParams, requireCapability("bookings.manage")]);
  const admin = createAdminClient();
  const search = searchValue(query.q);
  const eventId = /^\d+$/.test(query.event || "") ? Number(query.event) : null;
  const status = ["confirmed", "checked_in", "cancelled"].includes(query.status || "") ? query.status! : "active";
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);

  const { data: events, error: eventError } = await admin.from("events")
    .select("id,name,start_date,start_time,booking_capacity")
    .or("booking_enabled.eq.true,booking_mode.eq.website")
    .order("start_date", { ascending: false });
  let bookingQuery = admin.from("event_bookings")
    .select("id,event_id,reference_code,lead_name,email,party_size,status,confirmation_email_sent_at,confirmation_email_error,confirmation_email_attempts,created_at,cancellation_reason", { count: "exact" });
  if (eventId) bookingQuery = bookingQuery.eq("event_id", eventId);
  if (status === "active") bookingQuery = bookingQuery.in("status", ["confirmed", "checked_in"]);
  else bookingQuery = bookingQuery.eq("status", status);
  if (search) bookingQuery = bookingQuery.or(`reference_code.ilike.%${search}%,lead_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data: bookings, count, error: bookingError } = await bookingQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (eventError || bookingError) throw new Error("Unable to load visitor bookings.");

  let totalsQuery = admin.from("event_bookings").select("event_id,party_size,status").in("status", ["confirmed", "checked_in"]);
  if (eventId) totalsQuery = totalsQuery.eq("event_id", eventId);
  const { data: activeTotals } = await totalsQuery;
  const confirmedPeople = (activeTotals ?? []).reduce((total, booking) => total + booking.party_size, 0);
  const eventMap = new Map((events ?? []).map((event) => [event.id, event]));
  const selectedEvent = eventId ? eventMap.get(eventId) : null;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const notice = query.notice === "checked-in" ? "Booking checked in."
    : query.notice === "check-in-undone" ? "Check-in reversed."
      : query.notice === "email-sent" ? "Mobile ticket email sent."
        : query.notice === "cancelled" ? "Booking cancelled and the visitor was emailed."
          : query.notice === "cancelled-email-failed" ? "Booking cancelled. Email delivery failed and is marked for retry."
            : query.notice === "cancellation-email-sent" ? "Cancellation email sent."
            : null;
  const exportParams = new URLSearchParams();
  if (query.q) exportParams.set("q", query.q);
  if (query.event) exportParams.set("event", query.event);
  if (query.status) exportParams.set("status", query.status);

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Passenger control</p><h1>Visitor bookings</h1><p>Search, check in, contact and reconcile visitor groups.</p></div><span className="count-badge"><UsersRound/>{confirmedPeople} active visitors{selectedEvent?.booking_capacity ? ` / ${selectedEvent.booking_capacity}` : ""}</span></header>
    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {notice ? <p className={query.notice === "cancelled-email-failed" ? "form-message error" : "form-message success"}>{notice}</p> : null}
    <form className="booking-search" action="/admin/bookings" method="get">
      <label htmlFor="booking-search">Reference, visitor name or email</label>
      <div><Search/><input id="booking-search" name="q" defaultValue={query.q} placeholder="YME-12345-ABCDE" autoComplete="off"/><button className="button dark" type="submit">Filter</button></div>
      <div className="form-grid two"><label>Event<select name="event" defaultValue={query.event || ""}><option value="">All events</option>{(events ?? []).map((event) => <option value={event.id} key={event.id}>{format(parseISO(event.start_date), "d MMM yyyy")} — {event.name}</option>)}</select></label><label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked in</option><option value="cancelled">Cancelled</option></select></label></div>
      <Link className="button secondary" href={`/admin/bookings/export?${exportParams}`}><Download/>Export CSV</Link>
    </form>
    <div className="booking-admin-list">{(bookings ?? []).map((booking) => {
      const event = eventMap.get(booking.event_id);
      return <article key={booking.id} className={booking.status === "checked_in" ? "is-checked-in" : ""}>
        <div className="booking-admin-status">{booking.status === "checked_in" ? <UserCheck/> : booking.status === "cancelled" ? <Ban/> : <TicketCheck/>}<span>{booking.status.replace("_", " ")}</span></div>
        <div className="booking-admin-person"><strong>{booking.lead_name}</strong><a href={`mailto:${booking.email}`}>{booking.email}</a><small>Booked {format(new Date(booking.created_at), "d MMM yyyy")} · {booking.confirmation_email_attempts} email attempt{booking.confirmation_email_attempts === 1 ? "" : "s"}</small>{booking.confirmation_email_error ? <small className="form-message error">Email delivery needs attention</small> : null}</div>
        <div className="booking-admin-event"><span>{event ? `${format(parseISO(event.start_date), "d MMM yyyy")} · ${event.start_time.slice(0, 5)}` : "Event unavailable"}</span><strong>{event?.name || `Event ${booking.event_id}`}</strong><small>{booking.party_size} {booking.party_size === 1 ? "visitor" : "visitors"}</small></div>
        <div className="booking-admin-reference"><small>Booking reference</small><strong>{booking.reference_code}</strong>{booking.cancellation_reason ? <small>{booking.cancellation_reason}</small> : null}</div>
        {booking.status !== "cancelled" ? <div className="booking-admin-actions">
          {booking.status === "checked_in" ? <form action={undoBookingCheckIn}><input type="hidden" name="id" value={booking.id}/><button type="submit"><RotateCcw/>Undo check-in</button></form> : <form action={checkInBooking}><input type="hidden" name="id" value={booking.id}/><button className="check-in-button" type="submit"><UserCheck/>Check in group</button></form>}
          <form action={resendBookingConfirmation}><input type="hidden" name="id" value={booking.id}/><button type="submit"><MailCheck/>{booking.confirmation_email_sent_at ? "Resend ticket" : "Send ticket"}</button></form>
          <form action={cancelBooking}><input type="hidden" name="id" value={booking.id}/><input name="reason" maxLength={500} aria-label="Cancellation reason" placeholder="Reason (optional)"/><button type="submit"><Ban/>Cancel</button></form>
        </div> : booking.confirmation_email_error ? <div className="booking-admin-actions"><form action={resendBookingCancellation}><input type="hidden" name="id" value={booking.id}/><button type="submit"><MailCheck/>Retry cancellation email</button></form></div> : null}
      </article>;
    })}</div>
    {!bookings?.length ? <div className="booking-admin-empty"><TicketCheck/><h2>No bookings found</h2><p>Adjust the event, status or search filters.</p></div> : null}
    {pages > 1 ? <nav className="pagination" aria-label="Booking pages">{page > 1 ? <Link href={pageLink(query, page - 1)}>Previous</Link> : <span/>}<span>Page {page} of {pages} · {count} bookings</span>{page < pages ? <Link href={pageLink(query, page + 1)}>Next</Link> : <span/>}</nav> : null}
  </div>;
}
