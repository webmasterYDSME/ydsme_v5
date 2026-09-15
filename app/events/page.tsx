import { ArrowRight, CalendarDays, Clock3, LockKeyhole, MapPin, Navigation, Ticket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InnerHero } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { EventArtwork } from "./EventArtwork";
import { EventRowActions } from "./EventRowActions";
import { upcomingEvents } from "@/lib/public-event-schedule";
import { publicStorageUrl } from "@/lib/supabase/public";
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
  if (event.booking_enabled) return event.available_places > 0 ? `Free booking · ${event.available_places} places left` : "Fully booked";
  return event.is_ticket_required ? "Booking required" : "Free entry · No booking needed";
};

const directionsUrl = "https://www.google.com/maps/dir/?api=1&destination=53.94183%2C-1.11166";
const artworkUrl = (event: EventRecord) => publicStorageUrl(event.file_url, "images") || "/images/events.webp";
const eventDate = (event: { start_date: string; end_date: string }) => event.start_date === event.end_date
  ? format(parseISO(event.start_date), "EEEE d MMMM yyyy")
  : `${format(parseISO(event.start_date), "d MMM")} – ${format(parseISO(event.end_date), "d MMM yyyy")}`;

function EventAction({ event }: { event: EventRecord }) {
  return event.booking_enabled
    ? <Link className="button brass" href={`/events/${event.id}/book`}>{event.available_places > 0 ? "Book free places" : "View booking details"}<ArrowRight size={17}/></Link>
    : <Link className="button brass" href="/visitors">Plan your visit<ArrowRight size={17}/></Link>;
}

export default async function Events() {
  const [publicEvents, memberEvents] = await Promise.all([
    getPublicEvents(),
    getPublicMemberEventTeasers(),
  ]);
  const events = upcomingEvents(publicEvents);
  const featured = events[0];
  const more = events.slice(1, 5);
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
      image: new URL(artworkUrl(event), SITE_URL).href,
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
    {featured ? <div className="events-opening">
      <section className="section events-feature" id={`event-${featured.id}`} aria-labelledby="featured-event-title">
        <div className="events-feature-heading"><p className="eyebrow">The public running board</p><span>Next public event</span></div>
        <div className="events-feature-layout">
          <EventArtwork src={artworkUrl(featured)} name={featured.name} featured/>
          <div className="events-feature-copy">
            <span className="public-event-audience">Open to everyone</span>
            <h1 id="featured-event-title">{featured.name}</h1>
            <dl className="public-event-facts">
              <div><dt><CalendarDays size={20}/><span className="sr-only">Date</span></dt><dd>{eventDate(featured)}</dd></div>
              <div><dt><Clock3 size={20}/><span className="sr-only">Time</span></dt><dd>{eventTime(featured.start_time)}–{eventTime(featured.end_time)}<small>UK local time</small></dd></div>
              <div><dt><MapPin size={20}/><span className="sr-only">Location</span></dt><dd>York Model Engineers<small>Dringhouses · York YO24 2JE</small></dd></div>
            </dl>
            <p className={`public-event-status${featured.booking_enabled && !featured.available_places ? " is-full" : ""}`}><span className="public-event-booking-status"><Ticket size={17}/>{bookingStatus(featured)}</span></p>
            <div className="public-event-actions"><EventAction event={featured}/><a className="button event-directions-button" href={directionsUrl} target="_blank" rel="noreferrer">Get directions<Navigation size={17}/><span className="sr-only"> (opens in a new tab)</span></a></div>
          </div>
        </div>
      </section>
      <section className="section events-about" id="about-event" aria-labelledby="about-event-title">
        <div><p className="eyebrow dark">A day at the railway</p><h2 id="about-event-title">About <em>this event</em></h2></div>
        <p className="event-description">{featured.descriptions}</p>
      </section>
    </div> : <>
      <InnerHero kicker="The public running board" title={<>What’s next<br/><em>down the line.</em></>} copy="Public open days and special running days at York Model Engineers." image="/images/events.webp" imageAlt="Visitors riding miniature trains during a public open day at York Model Engineers" imagePosition="65% center" imageTone="bright"/>
      <section className="section events-empty"><p className="eyebrow dark">Timetable update</p><h2>More public dates are on their way.</h2><p>There are no upcoming public events listed. Check back soon, or explore our visitor information to plan a future visit.</p><Link className="button dark" href="/visitors">Visitor information<ArrowRight size={17}/></Link></section>
    </>}

    <span id="event-list" className="events-anchor" aria-hidden="true"/>
    {more.length ? <section className="section public-event-list" aria-labelledby="more-events-title">
      <header><div><p className="eyebrow dark">More dates for your diary</p><h2 id="more-events-title" tabIndex={-1}>Coming <em>up next</em></h2></div><span>{more.length} more public {more.length === 1 ? "event" : "events"}</span></header>
      <div className="public-event-cards">{more.map(event => <article className="public-event-card" id={`event-${event.id}`} key={event.id}>
        <EventArtwork src={artworkUrl(event)} name={event.name}/>
        <div><div className="public-event-meta"><p className="public-event-date">{eventDate(event)} · {eventTime(event.start_time)}–{eventTime(event.end_time)}</p><span className="public-event-audience">Open to everyone</span></div><h3>{event.name}</h3><p className="public-event-status">{bookingStatus(event)}</p>
          <EventRowActions name={event.name} description={event.descriptions}>
            {event.booking_enabled && <EventAction event={event}/>}
          </EventRowActions>
        </div>
      </article>)}</div>
    </section> : null}

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
          <p className="event-description">{event.descriptions}</p>
          <Link href="/membership" aria-label={`Explore membership for ${event.name}`}>Explore membership <ArrowRight/></Link>
        </div>
      </article>)}</div>
    </section> : null}

    <section className="member-banner"><p className="eyebrow">Beyond the public timetable</p><h2>More days at the track.<br/><em>More ways to take part.</em></h2><Link href="/membership" className="button brass">Explore membership <ArrowRight size={17}/></Link></section>
  </PageShell>;
}
