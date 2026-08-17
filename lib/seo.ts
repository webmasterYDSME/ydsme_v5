import type { Metadata } from "next";

export const SITE_URL = "https://www.yorkmodelengineers.co.uk";
export const SITE_NAME = "York Model Engineers";
export const DEFAULT_OG_IMAGE = "/og.png";

const sharedKeywords = [
  "York Model Engineers",
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
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  return {
    title: path === "/" ? { absolute: `${title} | ${SITE_NAME}` } : title,
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
      images: [
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
      images: [DEFAULT_OG_IMAGE],
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
  logo: `${SITE_URL}/ydsme-logo.png`,
  image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
  description:
    "A volunteer model engineering society operating miniature railways and live-steam events in Dringhouses, York.",
  foundingDate: "1929-09-15",
  email: "secretary@yorkmodelengineers.co.uk",
  address: {
    "@type": "PostalAddress",
    addressLocality: "York",
    postalCode: "YO24 2JE",
    addressCountry: "GB",
  },
  sameAs: ["https://www.facebook.com/YorkModelEngineers"],
  isAccessibleForFree: true,
};
