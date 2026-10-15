import type { Metadata } from "next";
import { SITE_URL } from "./site-origin.mjs";

export { SITE_URL };
export const SITE_NAME = "York Model Engineers";
export const DEFAULT_OG_IMAGE = "/og.png";

const sharedKeywords = [
  "York Model Engineers",
  "clockmaking",
  "workshop skills",
  "working machinery",
  "miniature railway York",
  "live steam York",
  "model engineering club",
  "miniature steam railway",
  "Dringhouses York",
];

export function publicPageMetadata({
  title,
  description,
  path,
  keywords = [],
  image,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: { url: string; alt: string };
}): Metadata {
  return {
    title: path === "/" ? { absolute: `${SITE_NAME} | ${title}` } : title,
    description,
    keywords: [...sharedKeywords, ...keywords],
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_GB",
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      images: image ? [image] : [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: "A miniature steam locomotive at York Model Engineers",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [image?.url || DEFAULT_OG_IMAGE],
    },
  };
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const organisationJsonLd = {
  "@context": "https://schema.org",
  "@type": ["Organization", "TouristAttraction"],
  "@id": `${SITE_URL}/#organisation`,
  name: "York City & District Society of Model Engineers",
  alternateName: "York Model Engineers",
  url: SITE_URL,
  logo: `${SITE_URL}/ydsme-logo-detailed-gold-lions.png`,
  image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
  description:
    "A model engineering society in York bringing together people interested in making, clockmaking, tools and working machinery, with miniature railways and public open days in Dringhouses.",
  foundingDate: "1929-09-15",
  email: "secretary@yorkmodelengineers.co.uk",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Rear of The Pastures, North Lane, Dringhouses",
    addressLocality: "York",
    postalCode: "YO24 2JE",
    addressCountry: "GB",
  },
  geo: { "@type": "GeoCoordinates", latitude: 53.94183, longitude: -1.11166 },
  hasMap: "https://www.google.com/maps/dir/?api=1&destination=53.94183%2C-1.11166",
  sameAs: ["https://www.facebook.com/YorkModelEngineers"],
  isAccessibleForFree: true,
};
