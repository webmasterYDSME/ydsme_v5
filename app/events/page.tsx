import { ArrowRight, CalendarDays, Ticket } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { getPublicEvents, type EventRecord } from "@/lib/data";
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
  const events = await getPublicEvents();
  const [featured, ...more] = events;
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

  return <PageShell><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventJsonLd) }} /><InnerHero kicker="The public running board" title={<>What’s next<br/><em>down the line.</em></>} copy="Public open days and special running days—live dates from the Society timetable, ready for your visit." image="/images/events.webp" imageAlt="Visitors riding miniature trains during a public open day at York Model Engineers" imagePosition="65% center" imageTone="bright"/>
    {featured ? <section className="section featured-event"><div className="big-date"><strong>{format(parseISO(featured.start_date), "dd")}</strong><span>{format(parseISO(featured.start_date), "MMM").toUpperCase()}<br/>{format(parseISO(featured.start_date), "yyyy")}</span></div><div><p className="eyebrow dark">Next departure · Public event</p><h2>{featured.name}</h2><p>{featured.descriptions}</p><div className="event-meta"><span><CalendarDays/> {format(parseISO(featured.start_date), "EEEE")}</span><span>{eventTime(featured.start_time)}</span><span>{bookingStatus(featured)}</span></div>{featured.booking_enabled && featured.available_places > 0 ? <Link className="button dark" href={`/events/${featured.id}/book`}>Book free places <Ticket size={17}/></Link> : null}</div><div className="signal"><i/><i/><i className="lit"/></div></section> : <section className="section featured-event empty-state"><div><p className="eyebrow dark">Timetable update</p><h2>Fresh dates are<br/><em>being prepared.</em></h2><p>There are no public running days currently listed. Please check back soon or contact the Society.</p></div></section>}
    {more.length ? <section className="events-list"><div className="events-label"><span>MORE PUBLIC DEPARTURES</span><span>YORK · {new Date().getFullYear()}</span></div>{more.map((event, index)=>{
      const url = bookingUrl(event);
      const internal = event.booking_enabled;
      const canBook = Boolean(url) && (!internal || event.available_places > 0);
      return <Reveal key={event.id} delay={index*.06}><article className="event-row"><div className="event-date"><strong>{format(parseISO(event.start_date), "dd")}</strong><span>{format(parseISO(event.start_date), "MMM").toUpperCase()}</span></div><div><p className="eyebrow dark">Public running day · {bookingStatus(event)}</p><h3>{event.name}</h3><p>{event.descriptions}</p></div><time dateTime={`${event.start_date}T${eventTime(event.start_time)}`}>{eventTime(event.start_time)}</time>{canBook ? internal ? <Link href={url!} aria-label={`Book ${event.name}`}><ArrowRight/></Link> : <a href={url!} aria-label={`Book ${event.name}`} target="_blank" rel="noreferrer"><ArrowRight/></a> : <ArrowRight aria-hidden="true"/>}</article></Reveal>;
    })}</section> : null}
    <section className="member-banner"><p className="eyebrow">Beyond the public timetable</p><h2>More days. More making.<br/><em>Members get the keys.</em></h2><Link href="/membership" className="button brass">Explore membership <ArrowRight size={17}/></Link></section>
  </PageShell>;
}
