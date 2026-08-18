import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import { format, parseISO } from "date-fns";
import { notFound } from "next/navigation";
import { BookingForm } from "@/app/components/BookingForm";
import { PageShell } from "@/app/components/PageShell";
import { getBookableEvent } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a visit",
  description: "Reserve a free place at a York Model Engineers public event.",
  robots: { index: false, follow: true },
};

export default async function EventBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId < 1) notFound();
  const event = await getBookableEvent(eventId);
  if (!event) notFound();

  return <PageShell><section className="booking-page">
    <div className="booking-event-panel">
      <Link href="/events" className="booking-back"><ArrowLeft/>All events</Link>
      <div><p className="eyebrow">Visitor booking</p><h1>{event.name}</h1><p>{event.descriptions}</p></div>
      <dl className="booking-facts">
        <div><dt><CalendarDays/>Date</dt><dd>{format(parseISO(event.start_date), "EEEE d MMMM yyyy")}</dd></div>
        <div><dt><Clock3/>Time</dt><dd>{event.start_time.slice(0, 5)}–{event.end_time.slice(0, 5)}</dd></div>
        <div><dt><MapPin/>Place</dt><dd>Dringhouses, York · YO24 2JE</dd></div>
        <div><dt><UsersRound/>Availability</dt><dd>{event.available_places} of {event.booking_capacity} places remain</dd></div>
      </dl>
      <p className="booking-assurance"><ShieldCheck/>This is a free capacity reservation. No payment details are requested.</p>
    </div>
    <div className="booking-form-panel">
      {event.available_places > 0
        ? <BookingForm eventId={event.id} availablePlaces={event.available_places}/>
        : <div className="booking-sold-out"><p className="eyebrow dark">Passenger list full</p><h2>This event is<br/><em>fully booked.</em></h2><p>Please check the events page for another public running day.</p><Link className="button dark" href="/events">See other events</Link></div>}
    </div>
  </section></PageShell>;
}
