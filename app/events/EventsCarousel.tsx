"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import type { EventRecord } from "@/lib/data";

const EVENTS_PER_VIEW = 3;
const eventTime = (value: string) => value.slice(0, 5);
const bookingUrl = (event: EventRecord) => event.booking_enabled ? `/events/${event.id}/book` : null;
const bookingStatus = (event: EventRecord) => {
  if (event.booking_enabled) return event.available_places > 0 ? `${event.available_places} places left` : "Fully booked";
  return event.is_ticket_required ? "Booking required" : "Free entry";
};

export function EventsCarousel({ events }: { events: EventRecord[] }) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const pageCount = Math.ceil(events.length / EVENTS_PER_VIEW);
  const visibleEvents = events.slice(page * EVENTS_PER_VIEW, (page + 1) * EVENTS_PER_VIEW);

  useEffect(() => {
    const anchor = window.location.hash.match(/^#event-(\d+)$/)?.[1];
    if (!anchor) return;
    const eventIndex = events.findIndex((event) => event.id === Number(anchor));
    if (eventIndex < 0) return;
    const targetPage = Math.floor(eventIndex / EVENTS_PER_VIEW);
    let scrollFrame = 0;
    const pageFrame = window.requestAnimationFrame(() => {
      setDirection("next");
      setPage(targetPage);
      scrollFrame = window.requestAnimationFrame(() => {
        document.getElementById(`event-${anchor}`)?.scrollIntoView({ block: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(pageFrame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [events]);

  const showPage = (nextPage: number) => {
    setDirection(nextPage < page ? "previous" : "next");
    setPage(nextPage);
  };

  return <section className="events-list" aria-label="More public events">
    <div className="events-label">
      <span>MORE PUBLIC DEPARTURES</span>
      <div className="events-carousel-controls">
        <span aria-live="polite">{page + 1} / {pageCount}</span>
        <button type="button" onClick={() => showPage(page - 1)} disabled={page === 0} aria-label="Previous three events"><ArrowLeft/></button>
        <button type="button" onClick={() => showPage(page + 1)} disabled={page === pageCount - 1} aria-label="Next three events"><ArrowRight/></button>
      </div>
    </div>
    <div className="events-carousel-viewport">
      <div className={`events-slide events-slide-${direction}`} key={page}>
        {visibleEvents.map((event) => {
          const url = bookingUrl(event);
          const action = event.available_places > 0 ? "Book" : "Details";
          const actionLabel = event.available_places > 0 ? `Book places for ${event.name}` : `View details for ${event.name}`;
          return <article className="event-row" id={`event-${event.id}`} key={event.id}>
            <div className="event-date"><strong>{format(parseISO(event.start_date), "dd")}</strong><span>{format(parseISO(event.start_date), "MMM").toUpperCase()}</span></div>
            <div><p className="eyebrow dark">Public running day · {bookingStatus(event)}</p><h3>{event.name}</h3><p>{event.descriptions}</p></div>
            <time dateTime={`${event.start_date}T${eventTime(event.start_time)}`}>{eventTime(event.start_time)}</time>
            {url ? <Link className="event-row-booking" href={url} aria-label={actionLabel}><span>{action}</span><ArrowRight/></Link> : null}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
