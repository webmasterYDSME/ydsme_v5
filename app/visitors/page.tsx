import { AlertTriangle, Camera, Car, CheckCircle2, Download, Gauge, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { InnerHero, PageShell, Reveal, SectionHeading } from "../components/RailSite";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Visitor Information & Open Days",
  description: "Plan your visit to York Model Engineers: directions, parking, accessibility, visitor rules and guidance for bringing a locomotive.",
  path: "/visitors",
  keywords: ["York Model Engineers visitor information", "miniature railway open days York"],
});

const rules=["Sign in at the clubhouse and wear a visitor badge","Follow the Track Marshal’s directions","Complete a familiarisation lap if you are a new driver","Check that locomotive brakes are fully functional","Keep to the 5 mph site speed limit","Never leave a steaming locomotive unattended"];
export default function Visitors(){return <PageShell><InnerHero kicker="Visitor guide · All aboard" title={<>Plan a day<br/><em>off the main line.</em></>} copy="Everything you need for a safe, easy and memorable day at York Model Engineers." image="/images/entrance.webp" imageAlt="The entrance to York Model Engineers in Dringhouses"/>
<section className="section visitor-top"><Reveal><div><p className="eyebrow dark">Before you set off</p><SectionHeading>Choose an open day.<br/><em>We’ll warm the rails.</em></SectionHeading></div></Reveal><Reveal><div className="fact-board"><div><MapPin/><span>What3Words</span><strong>play.tasty.trim</strong></div><div><Car/><span>Parking</span><strong>Free, on site</strong></div><div><Gauge/><span>Track limit</span><strong>5 mph</strong></div></div></Reveal></section>
<section className="rule-section"><div className="rule-intro"><p className="eyebrow">Running your model</p><h2>Safe steam is<br/><em>happy steam.</em></h2><p>Bring valid boiler and insurance certificates to the Track Marshal. Pressure vessels over 3 bar-litre require certification from a recognised authority; smaller vessels must have been tested within the last 12 months.</p></div><div className="rule-list">{rules.map((r,i)=><Reveal key={r} delay={i*.04}><p><span>{String(i+1).padStart(2,"0")}</span>{r}<CheckCircle2/></p></Reveal>)}</div></section>
<section className="section visitor-cards"><article><ShieldCheck/><p className="eyebrow dark">Young visitors</p><h3>Eyes bright.<br/>Hands safe.</h3><p>Under-18s must be accompanied by a parent or guardian. Under-14s may not drive. Junior members aged 14–17 may drive, but cannot carry the public.</p></article><article><Camera/><p className="eyebrow dark">Photography</p><h3>Capture the<br/>moment kindly.</h3><p>Photography is welcome. Ask permission before photographing children, and get consent before uploading images or video of others to social media.</p></article><article><AlertTriangle/><p className="eyebrow dark">On arrival</p><h3>Check in.<br/>Tune in.</h3><p>Non-driving visitors sign the guest book at the clubhouse. Signing in confirms that you will follow the Society bylaws displayed on the main noticeboard.</p></article></section>
<section className="cta-strip"><h2>Ready to make tracks?</h2><div className="cta-actions"><a className="button dark" href="/documents/visitor-safety-guide.pdf" target="_blank" rel="noreferrer">Visitor safety guide <Download size={17}/></a><Link className="button brass" href="/events">Find an open day</Link></div></section></PageShell>}
