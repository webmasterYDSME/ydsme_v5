import type { EventRecord } from "./data";

// Schema.org permits a local datetime without an offset when location is supplied.
// These times are entered in Europe/London; do not label summer dates as UTC.
export function eventStructuredData(event: EventRecord, siteUrl: string, image: string) {
  const url = `${siteUrl}/events/${event.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${url}#event`,
    url,
    name: event.name,
    description: event.descriptions,
    startDate: `${event.start_date}T${event.start_time.slice(0, 8)}`,
    endDate: `${event.end_date}T${event.end_time.slice(0, 8)}`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    isAccessibleForFree: event.booking_enabled || !event.is_ticket_required,
    image: new URL(image, siteUrl).href,
    location: {
      "@type": "Place",
      name: "York Model Engineers",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Rear of The Pastures, North Lane, Dringhouses",
        addressLocality: "York",
        postalCode: "YO24 2JE",
        addressCountry: "GB",
      },
    },
    organizer: { "@type": "Organization", "@id": `${siteUrl}/#organisation`, name: "York Model Engineers", url: siteUrl },
    ...(event.booking_enabled ? {
      offers: {
        "@type": "Offer",
        url: `${url}/book`,
        price: 0,
        priceCurrency: "GBP",
        availability: event.available_places > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      },
    } : {}),
  };
}

export function searchDescription(description: string) {
  const text = description.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
