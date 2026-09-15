import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { PageShell } from "@/app/components/PageShell";
import { EventArtwork } from "@/app/events/EventArtwork";
import { getPublicEventDetail } from "@/lib/public-event-detail";
import { publicStorageUrl } from "@/lib/supabase/public";
import { publicPageMetadata, safeJsonLd, SITE_URL } from "@/lib/seo";
import { eventStructuredData, searchDescription } from "@/lib/event-seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEventDetail((await params).id);
  if (!event) return { title: "Event not found", robots: { index: false, follow: true } };
  return publicPageMetadata({
    title: event.name,
    description: searchDescription(event.descriptions),
    path: `/events/${event.id}`,
    image: { url: publicStorageUrl(event.file_url, "images") || "/images/events.webp", alt: event.name },
  });
}

export default async function PublicEventPage({ params }: Props) {
  const event = await getPublicEventDetail((await params).id);
  if (!event) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const image = publicStorageUrl(event.file_url, "images") || "/images/events.webp";
  const date = event.start_date === event.end_date
    ? format(parseISO(event.start_date), "EEEE d MMMM yyyy")
    : `${format(parseISO(event.start_date), "d MMMM yyyy")} – ${format(parseISO(event.end_date), "d MMMM yyyy")}`;
  return <PageShell headerTheme="light">
    <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventStructuredData(event, SITE_URL, image)) }}/>
    <article className="section public-event-detail">
      <Link href="/events" className="public-project-back"><ArrowLeft/>All public events</Link>
      <div className="events-feature-layout">
        <EventArtwork src={image} name={event.name} featured/>
        <div className="events-feature-copy">
          <span className="public-event-audience">Open to everyone</span>
          <h1>{event.name}</h1>
          <dl className="public-event-facts">
            <div><dt><CalendarDays/><span className="sr-only">Date</span></dt><dd>{date}</dd></div>
            <div><dt><Clock3/><span className="sr-only">Time</span></dt><dd>{event.start_time.slice(0, 5)}–{event.end_time.slice(0, 5)}<small>UK local time</small></dd></div>
            <div><dt><MapPin/><span className="sr-only">Location</span></dt><dd>York Model Engineers<small>Rear of The Pastures, North Lane, Dringhouses<br/>York YO24 2JE</small></dd></div>
          </dl>
          <p className="public-event-status">{event.booking_enabled ? event.available_places > 0 ? `Free booking · ${event.available_places} places left` : "Fully booked" : event.is_ticket_required ? "Booking required" : "Free entry · No booking needed"}</p>
          <div className="public-event-actions">
            <Link className="button dark" href={event.booking_enabled ? `/events/${event.id}/book` : "/visitors"}>{event.booking_enabled ? event.available_places > 0 ? "Book free places" : "View booking details" : "Plan your visit"}<ArrowRight size={17}/></Link>
            <a className="button outline" href="https://www.google.com/maps/dir/?api=1&destination=53.94183%2C-1.11166" target="_blank" rel="noreferrer">Get directions<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </div>
      </div>
      <section className="public-event-detail-description" aria-labelledby="event-description-title"><h2 id="event-description-title">About this event</h2><p className="event-description">{event.descriptions}</p></section>
    </article>
  </PageShell>;
}
