import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Ban, Download, MailCheck, RotateCcw, Search, ShieldAlert, TicketCheck, UserCheck, UsersRound } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { cancelBooking, checkInBooking, resendBookingCancellation, resendBookingConfirmation, undoBookingCheckIn } from "@/lib/actions/bookings";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeSearchTerm } from "@/lib/security-input";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

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

  const eventsQuery = admin.from("events")
    .select("id,name,start_date,start_time,booking_capacity")
    .or("booking_enabled.eq.true,booking_mode.eq.website")
    .order("start_date", { ascending: false });
  let bookingQuery = admin.from("event_bookings")
    .select("id,event_id,reference_code,lead_name,email,party_size,status,confirmation_email_sent_at,confirmation_email_error,confirmation_email_attempts,created_at,cancellation_reason", { count: "exact" });
  if (eventId) bookingQuery = bookingQuery.eq("event_id", eventId);
  if (status === "active") bookingQuery = bookingQuery.in("status", ["confirmed", "checked_in"]);
  else bookingQuery = bookingQuery.eq("status", status);
  if (search) bookingQuery = bookingQuery.or(`reference_code.ilike.%${search}%,lead_name.ilike.%${search}%,email.ilike.%${search}%`);
  const [eventResult, bookingResult, summaryResult] = await Promise.all([
    eventsQuery,
    bookingQuery.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    admin.rpc("booking_management_summary", { p_event_id: eventId }),
  ]);
  const { data: events, error: eventError } = eventResult;
  const { data: bookings, count, error: bookingError } = bookingResult;
  if (eventError || bookingError || summaryResult.error) throw new Error("Unable to load visitor bookings.");
  const summary = (summaryResult.data ?? {}) as Record<string, number | string | null>;
  const confirmedPeople = Number(summary.confirmed_people ?? 0);
  const abuseTotals = {
    browser: Number(summary.browser ?? 0),
    ip: Number(summary.ip ?? 0),
    both: Number(summary.both ?? 0),
    lastBlockedAt: typeof summary.last_blocked_at === "string" ? summary.last_blocked_at : null,
  };
  const blockedAttempts = abuseTotals.browser + abuseTotals.ip + abuseTotals.both;
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
  const hasFilters = Boolean(query.q || query.event || query.status);
  const bookingCount = count ?? 0;

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Passenger control</p><h1>Visitor bookings</h1><p>Search, check in, contact and reconcile visitor groups.</p></div><div className="booking-heading-summary"><span className="count-badge"><UsersRound/>{confirmedPeople} active {confirmedPeople === 1 ? "visitor" : "visitors"}{selectedEvent?.booking_capacity ? ` / ${selectedEvent.booking_capacity}` : ""}</span><small>{bookingCount} matching {bookingCount === 1 ? "booking" : "bookings"}</small></div></header>
    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {notice ? <p className={query.notice === "cancelled-email-failed" ? "form-message error" : "form-message success"}>{notice}</p> : null}
    {blockedAttempts > 0 ? <div className="booking-abuse-summary"><ShieldAlert/><div><strong>{blockedAttempts} automatic booking {blockedAttempts === 1 ? "block" : "blocks"}</strong><span>{abuseTotals.browser} browser · {abuseTotals.ip} network · {abuseTotals.both} both{abuseTotals.lastBlockedAt ? ` · latest ${format(new Date(abuseTotals.lastBlockedAt), "d MMM yyyy, HH:mm")}` : ""}</span></div></div> : null}
    <form className="booking-filter-panel" action="/admin/bookings" method="get">
      <div className="booking-filter-heading"><div><h2>Find a booking</h2><p>Search the passenger list or narrow it by event and status.</p></div><Link prefetch={false} className="button secondary" href={`/admin/bookings/export?${exportParams}`}><Download/>Export CSV</Link></div>
      <div className="booking-filter-grid">
        <label className="booking-filter-search" htmlFor="booking-search">Reference, visitor name or email<span><Search/><input id="booking-search" name="q" defaultValue={query.q} placeholder="YME-12345-ABCDE" autoComplete="off"/></span></label>
        <label>Event<select name="event" defaultValue={query.event || ""}><option value="">All events</option>{(events ?? []).map((event) => <option value={event.id} key={event.id}>{format(parseISO(event.start_date), "d MMM yyyy")} — {event.name}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked in</option><option value="cancelled">Cancelled</option></select></label>
        <button className="button dark" type="submit">Apply filters</button>
      </div>
      {hasFilters ? <Link prefetch={false} className="booking-filter-clear" href="/admin/bookings"><RotateCcw/>Clear filters</Link> : null}
    </form>
    <div className="booking-admin-list">{(bookings ?? []).map((booking) => {
      const event = eventMap.get(booking.event_id);
      return <article key={booking.id} className={`booking-admin-card is-${booking.status.replace("_", "-")}`}>
        <header className="booking-admin-card-header"><div className="booking-admin-status">{booking.status === "checked_in" ? <UserCheck/> : booking.status === "cancelled" ? <Ban/> : <TicketCheck/>}<span>{booking.status.replace("_", " ")}</span></div><div className="booking-admin-reference"><small>Booking reference</small><strong>{booking.reference_code}</strong></div></header>
        <div className="booking-admin-details">
          <div className="booking-admin-person"><small className="booking-admin-label">Lead visitor</small><h2>{booking.lead_name}</h2><a href={`mailto:${booking.email}`}>{booking.email}</a><time dateTime={booking.created_at}>Booked {format(new Date(booking.created_at), "d MMM yyyy")} · {booking.confirmation_email_attempts} email attempt{booking.confirmation_email_attempts === 1 ? "" : "s"}</time>{booking.confirmation_email_error ? <small className="booking-delivery-warning"><ShieldAlert/>Email delivery needs attention</small> : null}</div>
          <div className="booking-admin-event"><small className="booking-admin-label">Event</small><strong>{event?.name || `Event ${booking.event_id}`}</strong><span>{event ? <><time dateTime={event.start_date}>{format(parseISO(event.start_date), "d MMM yyyy")}</time> · {event.start_time.slice(0, 5)}</> : "Event unavailable"}</span></div>
          <div className="booking-party-size"><UsersRound/><div><small className="booking-admin-label">Party size</small><strong>{booking.party_size} {booking.party_size === 1 ? "visitor" : "visitors"}</strong></div></div>
        </div>
        {booking.cancellation_reason ? <p className="booking-cancellation-note"><Ban/>Cancellation reason: {booking.cancellation_reason}</p> : null}
        {booking.status !== "cancelled" ? <div className="booking-admin-actions">
          {booking.status === "checked_in" ? <form action={undoBookingCheckIn}><input type="hidden" name="id" value={booking.id}/><PendingSubmitButton pendingLabel="Reversing…"><RotateCcw/>Undo check-in</PendingSubmitButton></form> : <form action={checkInBooking}><input type="hidden" name="id" value={booking.id}/><PendingSubmitButton className="check-in-button" pendingLabel="Checking in…"><UserCheck/>Check in group</PendingSubmitButton></form>}
          <form action={resendBookingConfirmation}><input type="hidden" name="id" value={booking.id}/><PendingSubmitButton pendingLabel="Sending…"><MailCheck/>{booking.confirmation_email_sent_at ? "Resend ticket" : "Send ticket"}</PendingSubmitButton></form>
          <form className="booking-cancel-form" action={cancelBooking}><input type="hidden" name="id" value={booking.id}/><input name="reason" maxLength={500} aria-label="Cancellation reason" placeholder="Cancellation reason (optional)"/><PendingSubmitButton pendingLabel="Cancelling…"><Ban/>Cancel booking</PendingSubmitButton></form>
        </div> : booking.confirmation_email_error ? <div className="booking-admin-actions"><form action={resendBookingCancellation}><input type="hidden" name="id" value={booking.id}/><PendingSubmitButton pendingLabel="Sending…"><MailCheck/>Retry cancellation email</PendingSubmitButton></form></div> : null}
      </article>;
    })}</div>
    {!bookings?.length ? <div className="booking-admin-empty"><TicketCheck/><h2>No bookings found</h2><p>Adjust the event, status or search filters.</p></div> : null}
    {pages > 1 ? <nav className="pagination" aria-label="Booking pages">{page > 1 ? <Link prefetch={false} href={pageLink(query, page - 1)}>Previous</Link> : <span/>}<span>Page {page} of {pages} · {count} bookings</span>{page < pages ? <Link prefetch={false} href={pageLink(query, page + 1)}>Next</Link> : <span/>}</nav> : null}
  </div>;
}
