import { ArrowRight, CalendarDays, Ticket } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InnerHero, PageShell, Reveal } from "../components/RailSite";
import { getPublicEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

const eventTime = (value: string) => value.slice(0, 5);

export default async function Events() {
  const events = await getPublicEvents();
  const [featured, ...more] = events;

  return <PageShell><InnerHero kicker="The public running board" title={<>What’s next<br/><em>down the line.</em></>} copy="Public open days and special running days—live dates from the Society timetable, ready for your visit." image="/images/engine.webp"/>
    {featured ? <section className="section featured-event"><div className="big-date"><strong>{format(parseISO(featured.start_date), "dd")}</strong><span>{format(parseISO(featured.start_date), "MMM").toUpperCase()}<br/>{format(parseISO(featured.start_date), "yyyy")}</span></div><div><p className="eyebrow dark">Next departure · Public event</p><h2>{featured.name}</h2><p>{featured.descriptions}</p><div className="event-meta"><span><CalendarDays/> {format(parseISO(featured.start_date), "EEEE")}</span><span>{eventTime(featured.start_time)}</span><span>{featured.is_ticket_required ? "Booking required" : "Free entry"}</span></div>{featured.is_ticket_required && featured.reservation_link ? <a className="button dark" href={featured.reservation_link} target="_blank" rel="noreferrer">Reserve a place <Ticket size={17}/></a> : null}</div><div className="signal"><i/><i/><i className="lit"/></div></section> : <section className="section featured-event empty-state"><div><p className="eyebrow dark">Timetable update</p><h2>Fresh dates are<br/><em>being prepared.</em></h2><p>There are no public running days currently listed. Please check back soon or contact the Society.</p></div></section>}
    {more.length ? <section className="events-list"><div className="events-label"><span>MORE PUBLIC DEPARTURES</span><span>YORK · {new Date().getFullYear()}</span></div>{more.map((event, index)=><Reveal key={event.id} delay={index*.06}><article className="event-row"><div className="event-date"><strong>{format(parseISO(event.start_date), "dd")}</strong><span>{format(parseISO(event.start_date), "MMM").toUpperCase()}</span></div><div><p className="eyebrow dark">Public running day</p><h3>{event.name}</h3><p>{event.descriptions}</p></div><time>{eventTime(event.start_time)}</time>{event.is_ticket_required && event.reservation_link ? <a href={event.reservation_link} aria-label={`Book ${event.name}`} target="_blank" rel="noreferrer"><ArrowRight/></a> : <ArrowRight/>}</article></Reveal>)}</section> : null}
    <section className="member-banner"><p className="eyebrow">Beyond the public timetable</p><h2>More days. More making.<br/><em>Members get the keys.</em></h2><Link href="/membership" className="button brass">Explore membership <ArrowRight size={17}/></Link></section>
  </PageShell>;
}
