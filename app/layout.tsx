import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import {ReactNode} from "react";

const display = Cormorant_Garamond({ variable: "--font-display", subsets: ["latin"], weight: ["400","500","600","700"], style: ["normal","italic"] });
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400","500","600","700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.yorkmodelengineers.co.uk"),
  title: { default: "York Model Engineers", template: "%s | York Model Engineers" },
  description: "Miniature railways, model engineering and live steam in five woodland acres at Dringhouses, York.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "York Model Engineers — Small engines. Grand adventures.",
    description: "Live steam, model engineering and miniature railways in five woodland acres at Dringhouses, York.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "York Model Engineers miniature steam locomotive" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${sans.variable}`}>{children}</body></html>;
}
