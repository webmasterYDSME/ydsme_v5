import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import { format, parseISO } from "date-fns";
import { notFound } from "next/navigation";
import { BookingForm } from "@/app/components/BookingForm";
import { PageShell } from "@/app/components/PageShell";
import { eventImage, getBookableEvent } from "@/lib/data";
import styles from "./booking.module.css";

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

  return <PageShell headerTheme="light"><section className={`booking-page ${styles.booking}`}>
    <Link href={`/events/${event.id}`} className={styles.back}><ArrowLeft size={16}/>Event details</Link>
    <div className={styles.layout}>
    <div className="booking-event-panel">
      {event.file_url ? <div className="booking-event-banner" aria-hidden="true"><Image src={eventImage(event.file_url)} alt="" fill sizes="(max-width: 1000px) 100vw, 640px" quality={75} preload/></div> : null}
      <div><p className="eyebrow">Visitor booking</p><h1>{event.name}</h1></div>
      <dl className="booking-facts">
        <div><dt><CalendarDays/>Date</dt><dd>{format(parseISO(event.start_date), "EEEE d MMMM yyyy")}</dd></div>
        <div><dt><Clock3/>Time</dt><dd>{event.start_time.slice(0, 5)}–{event.end_time.slice(0, 5)}</dd></div>
        <div><dt><MapPin/>Place</dt><dd>Dringhouses, York · YO24 2JE</dd></div>
        <div><dt><UsersRound/>Availability</dt><dd>{event.available_places} of {event.booking_capacity} places remain</dd></div>
      </dl>
      <p className="booking-assurance"><ShieldCheck/>This is a free capacity reservation. No payment details are requested.</p>
      <details className={styles.description}><summary>About this event</summary><p>{event.descriptions}</p></details>
      {event.available_places > 0 ? <a href="#reserve-visit" className={`button brass ${styles.jump}`}>Reserve your visit</a> : null}
    </div>
    <div className="booking-form-panel" id="reserve-visit">
      {event.available_places > 0
        ? <BookingForm eventId={event.id} availablePlaces={event.available_places}/>
        : <div className="booking-sold-out"><p className="eyebrow dark">Passenger list full</p><h2>This event is<br/><em>fully booked.</em></h2><p>Please check the events page for another public running day.</p><Link className="button dark" href="/events#event-list">See other events</Link></div>}
    </div>
    </div>
  </section></PageShell>;
}
