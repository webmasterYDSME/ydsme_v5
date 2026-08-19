import { ArrowRight, CalendarDays, LockKeyhole, Ticket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InnerHero } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { EventsCarousel } from "./EventsCarousel";
import {
  getPublicEvents,
  getPublicMemberEventTeasers,
  memberEventImage,
  type EventRecord,
} from "@/lib/data";
import { publicPageMetadata, safeJsonLd, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Public Running Days & Events",
  description: "See upcoming public running days, miniature railway events and special live-steam dates at York Model Engineers.",
  path: "/events",
  keywords: ["York miniature railway events", "live steam events York", "public running days"],
});

const eventTime = (value: string) => value.slice(0, 5);
const bookingUrl = (event: EventRecord) => event.booking_enabled ? `/events/${event.id}/book` : null;
const bookingStatus = (event: EventRecord) => {
  if (event.booking_enabled) return event.available_places > 0 ? `${event.available_places} places left` : "Fully booked";
  return event.is_ticket_required ? "Booking required" : "Free entry";
};

export default async function Events() {
  const [events, memberEvents] = await Promise.all([
    getPublicEvents(),
    getPublicMemberEventTeasers(),
  ]);
  const [featured, ...more] = events;
  const bookingFeature = events.find((event) => event.booking_enabled && event.available_places > 0);
  const advanceBooking = bookingFeature?.id !== featured?.id ? bookingFeature : null;
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@graph": events.map((event) => ({
      "@type": "Event",
      "@id": `${SITE_URL}/events#event-${event.id}`,
      name: event.name,
      description: event.descriptions,
      startDate: `${event.start_date}T${eventTime(event.start_time)}`,
      endDate: `${event.end_date}T${eventTime(event.end_time)}`,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      isAccessibleForFree: event.booking_enabled ? true : !event.is_ticket_required,
      image: `${SITE_URL}/images/engine.webp`,
      location: {
        "@type": "Place",
        name: "York Model Engineers",
        address: {
          "@type": "PostalAddress",
          addressLocality: "York",
          postalCode: "YO24 2JE",
          addressCountry: "GB",
        },
      },
      organizer: {
        "@type": "Organization",
        name: "York Model Engineers",
        url: SITE_URL,
      },
      ...(bookingUrl(event) ? { url: `${SITE_URL}${bookingUrl(event)}` } : { url: `${SITE_URL}/events` }),
    })),
  };

  return <PageShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventJsonLd) }} />
    <InnerHero kicker="The public running board" title={<>What’s next<br/><em>down the line.</em></>} copy="Public open days and special running days—live dates from the Society timetable, ready for your visit." image="/images/events.webp" imageAlt="Visitors riding miniature trains during a public open day at York Model Engineers" imagePosition="65% center" imageTone="bright"/>
    <span id="event-list" className="events-anchor" aria-hidden="true"/>

    {advanceBooking ? <section className="advance-booking" aria-labelledby="advance-booking-title">
      <div className="advance-booking-mark"><Ticket/><span>Book ahead</span></div>
      <div className="advance-booking-copy">
        <p className="eyebrow">Reservations are open</p>
        <h2 id="advance-booking-title">{advanceBooking.name}</h2>
        <p>{format(parseISO(advanceBooking.start_date), "EEEE d MMMM yyyy")} · {eventTime(advanceBooking.start_time)} · {bookingStatus(advanceBooking)}</p>
      </div>
      <Link className="button brass" href={`/events/${advanceBooking.id}/book`}>Reserve free places <ArrowRight size={17}/></Link>
    </section> : null}

    {featured ? <section className="section featured-event" id={`event-${featured.id}`}>
      <div className="big-date"><strong>{format(parseISO(featured.start_date), "dd")}</strong><span>{format(parseISO(featured.start_date), "MMM").toUpperCase()}<br/>{format(parseISO(featured.start_date), "yyyy")}</span></div>
      <div>
        <p className="eyebrow dark">Next departure · Public event</p>
        <h2>{featured.name}</h2>
        <p>{featured.descriptions}</p>
        <div className="event-meta"><span><CalendarDays/> {format(parseISO(featured.start_date), "EEEE")}</span><span>{eventTime(featured.start_time)}</span><span>{bookingStatus(featured)}</span></div>
        {featured.booking_enabled ? <Link className="button dark" href={`/events/${featured.id}/book`}>{featured.available_places > 0 ? <><span>Reserve free places</span><Ticket size={17}/></> : <><span>View event details</span><ArrowRight size={17}/></>}</Link> : null}
      </div>
      <div className="signal"><i/><i/><i className="lit"/></div>
    </section> : <section className="section featured-event empty-state"><div><p className="eyebrow dark">Timetable update</p><h2>Fresh dates are<br/><em>being prepared.</em></h2><p>There are no public running days currently listed. Please check back soon or contact the Society.</p></div></section>}

    {more.length ? <EventsCarousel events={more}/> : null}

    {memberEvents.length ? <section className="member-event-teasers" aria-labelledby="member-events-title">
      <div className="member-event-heading">
        <div><p className="eyebrow">Inside the club gates</p><h2 id="member-events-title">There’s more on the<br/><em>members’ timetable.</em></h2></div>
        <p>Selected club days, projects and gatherings are shown here as a glimpse of membership. Join the Society to take part and see the full private timetable.</p>
      </div>
      <div className={`member-event-grid member-event-grid-${memberEvents.length}`}>{memberEvents.map((event) => <article className="member-event-card" key={event.id}>
        <div className="member-event-image"><Image src={memberEventImage(event.file_url)} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 900px) 40vw, 33vw"/></div>
        <div className="member-event-card-copy">
          <p className="member-event-label"><LockKeyhole/> Members only</p>
          <p className="member-event-date">{format(parseISO(event.start_date), "EEEE d MMMM")} · {eventTime(event.start_time)}</p>
          <h3>{event.name}</h3>
          <p>{event.descriptions}</p>
          <Link href="/membership" aria-label={`Explore membership for ${event.name}`}>Explore membership <ArrowRight/></Link>
        </div>
      </article>)}</div>
    </section> : null}

    <section className="member-banner"><p className="eyebrow">Beyond the public timetable</p><h2>More days at the track.<br/><em>More ways to take part.</em></h2><Link href="/membership" className="button brass">Explore membership <ArrowRight size={17}/></Link></section>
  </PageShell>;
}
