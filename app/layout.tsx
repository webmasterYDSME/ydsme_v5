import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import {ReactNode} from "react";
import { organisationJsonLd, safeJsonLd } from "@/lib/seo";

const display = Cormorant_Garamond({ variable: "--font-display", subsets: ["latin"], weight: ["400","500","600","700"], style: ["normal","italic"], display: "swap", preload: false });
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400","500","600","700"], preload: false });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.yorkmodelengineers.co.uk"),
  title: { default: "York Model Engineers | Miniature Railways & Live Steam in York", template: "%s | York Model Engineers" },
  description: "Miniature railways, model engineering and live steam in five woodland acres at Dringhouses, York.",
  applicationName: "York Model Engineers",
  category: "Model engineering and miniature railways",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "York Model Engineers",
    url: "/",
    title: "York Model Engineers — Small engines. Grand adventures.",
    description: "Live steam, model engineering and miniature railways in five woodland acres at Dringhouses, York.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "York Model Engineers miniature steam locomotive" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "York Model Engineers — Small engines. Grand adventures.",
    description: "Live steam, model engineering and miniature railways in Dringhouses, York.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en-GB"><body className={`${display.variable} ${sans.variable}`}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(organisationJsonLd) }} />{children}</body></html>;
}
