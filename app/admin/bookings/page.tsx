import { format, parseISO } from "date-fns";
import { MailCheck, RotateCcw, Search, TicketCheck, UserCheck, UsersRound } from "lucide-react";
import { canManageContent, requireUser } from "@/lib/auth";
import { checkInBooking, resendBookingConfirmation, undoBookingCheckIn } from "@/lib/actions/bookings";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  event_id: number;
  reference_code: string;
  lead_name: string;
  email: string;
  party_size: number;
  status: string;
  confirmation_email_sent_at: string | null;
  created_at: string;
};

type EventSummary = {
  id: number;
  name: string;
  start_date: string;
  start_time: string;
  booking_capacity: number | null;
};

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const [query, { role }] = await Promise.all([searchParams, requireUser()]);
  const admin = createAdminClient();
  const [{ data: eventData, error: eventError }, { data: bookingData, error: bookingError }] = await Promise.all([
    admin.from("events").select("id,name,start_date,start_time,booking_capacity").eq("booking_enabled", true).order("start_date", { ascending: false }),
    admin.from("event_bookings").select("id,event_id,reference_code,lead_name,email,party_size,status,confirmation_email_sent_at,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (eventError || bookingError) throw new Error((eventError || bookingError)?.message);

  const events = (eventData ?? []) as EventSummary[];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const search = (query.q || "").trim().toLowerCase();
  const bookings = ((bookingData ?? []) as BookingRow[]).filter((booking) => {
    if (!search) return booking.status !== "cancelled";
    const event = eventMap.get(booking.event_id);
    return [booking.reference_code, booking.lead_name, booking.email, event?.name || ""]
      .some((value) => value.toLowerCase().includes(search));
  });
  const confirmedPeople = bookings.filter((booking) => booking.status !== "cancelled").reduce((total, booking) => total + booking.party_size, 0);
  const editable = canManageContent(role);

  const notice = query.notice === "checked-in" ? "Booking checked in."
    : query.notice === "check-in-undone" ? "Check-in reversed."
      : query.notice === "email-sent" ? "Mobile ticket email sent."
        : null;

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Passenger control</p><h1>Visitor bookings</h1><p>Find a booking by reference, visitor name or email, then verify the group when they arrive.</p></div><span className="count-badge"><UsersRound/>{confirmedPeople} visitors</span></header>
    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {notice ? <p className="form-message success">{notice}</p> : null}
    <form className="booking-search" action="/admin/bookings" method="get"><label htmlFor="booking-search">Booking reference, name or email</label><div><Search/><input id="booking-search" name="q" defaultValue={query.q} placeholder="YME-12345-ABCDE" autoComplete="off"/><button className="button dark" type="submit">Find booking</button></div></form>
    {!editable ? <p className="read-only-note">Read-only committee access: you can verify bookings but cannot change check-in status.</p> : null}
    <div className="booking-admin-list">{bookings.map((booking) => {
      const event = eventMap.get(booking.event_id);
      return <article key={booking.id} className={booking.status === "checked_in" ? "is-checked-in" : ""}>
        <div className="booking-admin-status">{booking.status === "checked_in" ? <UserCheck/> : <TicketCheck/>}<span>{booking.status === "checked_in" ? "Checked in" : booking.status}</span></div>
        <div className="booking-admin-person"><strong>{booking.lead_name}</strong><a href={`mailto:${booking.email}`}>{booking.email}</a><small>Booked {format(new Date(booking.created_at), "d MMM yyyy")}</small></div>
        <div className="booking-admin-event"><span>{event ? `${format(parseISO(event.start_date), "d MMM yyyy")} · ${event.start_time.slice(0, 5)}` : "Event unavailable"}</span><strong>{event?.name || `Event ${booking.event_id}`}</strong><small>{booking.party_size} {booking.party_size === 1 ? "visitor" : "visitors"}</small></div>
        <div className="booking-admin-reference"><small>Booking reference</small><strong>{booking.reference_code}</strong></div>
        <div className="booking-admin-actions">
          {editable ? booking.status === "checked_in" ? <form action={undoBookingCheckIn}><input type="hidden" name="id" value={booking.id}/><button type="submit"><RotateCcw/>Undo check-in</button></form> : <form action={checkInBooking}><input type="hidden" name="id" value={booking.id}/><button className="check-in-button" type="submit"><UserCheck/>Check in group</button></form> : null}
          {editable ? <form action={resendBookingConfirmation}><input type="hidden" name="id" value={booking.id}/><button type="submit"><MailCheck/>{booking.confirmation_email_sent_at ? "Resend ticket" : "Send ticket"}</button></form> : null}
        </div>
      </article>;
    })}</div>
    {!bookings.length ? <div className="booking-admin-empty"><TicketCheck/><h2>No bookings found</h2><p>{search ? "Try the complete reference, visitor name or email address." : "Bookings will appear here as visitors reserve places."}</p></div> : null}
  </div>;
}
