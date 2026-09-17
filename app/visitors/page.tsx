import { AlertTriangle, Camera, Car, CheckCircle2, Download, Gauge, MapPin, Navigation, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { GenericDonation } from "../components/DonationCards";
import { getDonationSettings } from "@/lib/data";
import { publicPageMetadata } from "@/lib/seo";
import styles from "./visitors.module.css";

export const revalidate = 300;

export const metadata = publicPageMetadata({
  title: "Visitor Information & Open Days",
  description: "Plan your visit to York Model Engineers: directions, parking, accessibility, visitor rules and guidance for bringing a locomotive.",
  path: "/visitors",
  keywords: ["York Model Engineers visitor information", "miniature railway open days York"],
});

const rules=["Sign in at the clubhouse and wear a visitor badge","Follow the Track Marshal’s directions","Complete a familiarisation lap if you are a new driver","Check that locomotive brakes are fully functional","Keep to the 5 mph site speed limit","Never leave a steaming locomotive unattended"];
export default async function Visitors(){const donations=await getDonationSettings();return <PageShell><div className={styles.visitors}><InnerHero kicker="Visitor guide · All aboard" title={<>Plan a day<br/><em>off the main line.</em></>} copy="Everything you need for a safe, easy and memorable day at York Model Engineers." image="/images/entrance.webp" imageAlt="The entrance to York Model Engineers in Dringhouses"><div className="button-row"><Link className="button brass" href="/events">Find an open day</Link><a className="button ghost" href="#visitor-location-title">Getting here <Navigation size={17}/></a></div></InnerHero>
<section className="section visitor-location" aria-labelledby="visitor-location-title"><Reveal><div className="visitor-location-intro"><p className="eyebrow dark">Before you set off</p><h2 className="section-heading" id="visitor-location-title">Arrive at the<br/><em>right place.</em></h2><p>Choose an open day, then save the entrance point before setting off. The club is tucked away behind The Pastures, so the exact pin will bring you to our gate.</p></div></Reveal><Reveal><article className="location-card"><div className="location-address"><MapPin aria-hidden="true"/><div><span>Club location</span><address><strong>York City &amp; District Society of Model Engineers</strong><br/>Rear of The Pastures, North Lane<br/>Dringhouses, York YO24 2JE</address></div></div><div className="coordinate-note"><Navigation aria-hidden="true"/><div><strong>Use the exact entrance coordinates</strong><p>For accurate navigation, use the coordinates below rather than relying only on the postcode.</p><code>53.94183, -1.11166</code><a className="button brass location-directions" href="https://www.google.com/maps/dir/?api=1&amp;destination=53.94183%2C-1.11166" target="_blank" rel="noreferrer" aria-label="Get directions to the exact club entrance coordinates (opens in a new tab)">Get Directions <Navigation size={17}/></a></div></div><div className="arrival-facts" aria-label="Visitor arrival information"><div><MapPin aria-hidden="true"/><span>What3Words</span><strong>play.tasty.trim</strong></div><div><Car aria-hidden="true"/><span>Parking</span><strong>Free, on site</strong></div><div><Gauge aria-hidden="true"/><span>Track limit</span><strong>5 mph</strong></div></div></article></Reveal></section>
<section className="rule-section"><div className="rule-intro"><p className="eyebrow">Running your model</p><h2>Safe steam is<br/><em>happy steam.</em></h2><p>Bring valid boiler and insurance certificates to the Track Marshal. Pressure vessels over 3 bar-litre require certification from a recognised authority; smaller vessels must have been tested within the last 12 months.</p></div><div className="rule-list">{rules.map((r,i)=><Reveal key={r} delay={i*.04}><p><span>{String(i+1).padStart(2,"0")}</span>{r}<CheckCircle2/></p></Reveal>)}</div></section>
<section className="section visitor-cards"><article><ShieldCheck/><p className="eyebrow dark">Young visitors</p><h3>Eyes bright.<br/>Hands safe.</h3><p>

  Under-18s must be with a parent or guardian. Junior members age 14–15 may drive but not carry the public. Junior members age 16–17 may carry the public after passing a proficiency check.

</p></article><article><Camera/><p className="eyebrow dark">Photography</p><h3>Capture the<br/>moment kindly.</h3><p>Photography is welcome. Ask permission before photographing children, and get consent before uploading images or video of others to social media.</p></article><article><AlertTriangle/><p className="eyebrow dark">On arrival</p><h3>Check in.<br/>Tune in.</h3><p>Non-driving visitors sign the guest book at the clubhouse. Signing in confirms that you will follow the Society bylaws displayed on the main noticeboard.</p></article></section>
<GenericDonation campaign={donations.generic}/>
<section className="cta-strip"><h2>Ready to make tracks?</h2><div className="cta-actions"><a className="button dark" href="/documents/visitor-safety-guide.pdf" target="_blank" rel="noreferrer">Visitor safety guide <Download size={17}/></a><Link className="button brass" href="/events">Find an open day</Link></div></section></div></PageShell>}
