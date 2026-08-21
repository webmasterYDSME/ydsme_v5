import { CircleCheck, HeartHandshake } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...publicPageMetadata({
    title: "Thank You for Your Donation",
    description: "Thank you for supporting York City & District Society of Model Engineers.",
    path: "/thank-you",
  }),
  robots: { index: false, follow: false },
};

export default function DonationThankYou() {
  return (
    <PageShell>
      <main className="donation-thanks">
        <div>
          <span className="donation-thanks-icon" aria-hidden="true"><CircleCheck /></span>
          <p className="eyebrow dark"><HeartHandshake aria-hidden="true" /> Thank you</p>
          <h1>Your kindness<br /><em>keeps us moving.</em></h1>
          <p>Your donation has been submitted securely. It will help the Society care for the railway, grounds and the future of model engineering in York.</p>
          <div className="button-row">
            <Link className="button dark" href="/">Return home</Link>
            <Link className="button outline" href="/events">See upcoming events</Link>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
