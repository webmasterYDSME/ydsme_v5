import { ArrowRight, ArrowUpRight, CalendarDays, Gauge, Globe2, Handshake, MapPin, Navigation, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InteractiveSteamTrain, Reveal, SectionHeading } from "./components/RailSite";
import { PageShell } from "./components/PageShell";
import { TargetDonation } from "./components/DonationCards";
import { getCarriageAnnouncements, getDonationSettings, getPublicEvents } from "@/lib/data";
import { publicPageMetadata } from "@/lib/seo";

// Public database content is resolved at request time. This keeps builds
// independent from a live Supabase schema and avoids caching operational data.
export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Miniature Railways & Live Steam in York",
  description: "Discover miniature railways, live steam and model engineering across five woodland acres at York Model Engineers in Dringhouses.",
  path: "/",
  keywords: ["family days out York", "York railway attraction"],
});

const interests = [
  { name: "2.5–7.25 inch locomotives" }, { name: "Stationary engines" }, { name: "Traction engines" },
  { name: "16mm & Gauge 1 railways" }, { name: "Decorative woodworking" }, { name: "Clocks & mechanisms" },
  { name: "Kit building & 3D printing" }, { name: "Brook Moor Railway", detail: "G gauge railway", isNew: true },
];

export default async function Home() {
  const [publicEvents, donations, announcements] = await Promise.all([getPublicEvents(), getDonationSettings(), getCarriageAnnouncements(1)]);
  const nextEvent = publicEvents.find((event) => event.display_in_homepage) ?? publicEvents[0];
  return (
    <PageShell>
      <section className="hero" aria-labelledby="home-hero-title">
        <Image src="/images/hero.webp" alt="A miniature steam locomotive at York Model Engineers" fill loading="eager" fetchPriority="low" quality={35} sizes="100vw" />
        <div className="hero-wash" />
        <div className="steam steam-one" /><div className="steam steam-two" /><div className="steam steam-three" />
        <div className="hero-copy">
          <p className="eyebrow">York · Since 1929</p>
          <h1 id="home-hero-title">Small engines.<br/><em>Grand adventures.</em></h1>
          <p className="hero-lede">Five woodland acres. Three miniature railways. Generations of makers keeping steam, skill and wonder in motion.</p>
          <div className="button-row"><Link className="button brass" href="/visitors">Plan your visit <ArrowRight size={17}/></Link><Link className="button ghost" href="/membership">Join the society</Link></div>
        </div>
        {nextEvent ? <Link className="next-running-badge" href="/events"><span className="next-running-kicker"><i aria-hidden="true"/> Next public running</span><time className="next-running-date" dateTime={`${nextEvent.start_date}T${nextEvent.start_time.slice(0,5)}`}><strong>{format(parseISO(nextEvent.start_date), "dd")}</strong><span>{format(parseISO(nextEvent.start_date), "MMM").toUpperCase()}<small>{format(parseISO(nextEvent.start_date), "yyyy")}</small></span></time><span className="next-running-name">{nextEvent.name}</span><span className="next-running-detail">{format(parseISO(nextEvent.start_date), "EEE")} · {nextEvent.start_time.slice(0,5)}</span><span className="next-running-arrow" aria-hidden="true"><ArrowUpRight/></span></Link> : null}
        <div className="track-line"><InteractiveSteamTrain announcements={announcements.map(({ id, title, body }) => ({ id, title, body }))}/></div>
      </section>

      <section className="ticker" aria-label="Club highlights"><div>FREE ENTRY <i/> FREE RIDES <i/> OPEN DAYS <i/> LIVE STEAM <i/> YORK’S HIDDEN RAILWAY <i/> FREE ENTRY <i/> FREE RIDES <i/> OPEN DAYS <i/> LIVE STEAM</div></section>

      <section className="section intro-grid">
        <Reveal><div><p className="eyebrow dark">Welcome aboard</p><SectionHeading>Engineering,<br/>but make it <em>magic.</em></SectionHeading></div></Reveal>
        <Reveal delay={0.12}><div className="intro-copy"><p className="large-copy">Alongside the East Coast Main Line in Dringhouses sits an unexpected world of polished brass, coal smoke and precisely profiled steel rail.</p><p>We’re a friendly society of model engineers and artisans, maintaining nearly five acres of landscaped woodland where ideas become working machines.</p><Link className="text-link" href="/club-history">Read our 97-year story <ArrowRight size={16}/></Link></div></Reveal>
      </section>

      <section className="feature-photo">
        <Image src="/images/track.webp" alt="Miniature railway track through the club grounds" fill quality={35} sizes="100vw" />
        <div className="feature-card"><span className="counter">03</span><h2>Railways,<br/>one remarkable site</h2><p>Raised and ground-level tracks engineered for locomotives from 2.5&quot; to 7.25&quot; gauge.</p></div>
      </section>

      <TargetDonation campaign={donations.target} />

      <section className="section">
        <Reveal><div className="section-heading-row"><SectionHeading>Find your <em>fascination.</em></SectionHeading><p>Old-school craft meets new-school making. There is always another skill to learn—and someone happy to share it.</p></div></Reveal>
        <div className="interest-rail">{interests.map((item, i)=><Reveal key={item.name} delay={i*.04}><div className={item.isNew ? "interest interest-new" : "interest"}><span className="interest-number">{String(i+1).padStart(2,"0")}</span><div className="interest-copy"><div className="interest-title-row"><p>{item.name}</p>{item.isNew ? <span className="interest-new-badge"><Sparkles aria-hidden="true"/>New</span> : null}</div>{item.detail ? <small>{item.detail}</small> : null}</div><Gauge className="interest-gauge" size={18}/></div></Reveal>)}</div>
      </section>

      <section className="twinning-panel" aria-labelledby="twinning-title">
        <div className="twinning-visual" aria-hidden="true">
          <span className="twinning-kicker">York ↔ New South Wales</span>
          <div className="twinning-globe">
            <Globe2 strokeWidth={0.7}/>
            <span className="twinning-route-line"/>
            <span className="twinning-place twinning-york"><i/>York<small>England</small></span>
            <span className="twinning-place twinning-galston"><i/>Galston<small>NSW · Australia</small></span>
          </div>
          <p>Two clubs <i/> one shared passion</p>
        </div>
        <div className="twinning-copy">
          <p className="eyebrow">Friends across the world</p>
          <h2 id="twinning-title">One craft.<br/><em>Two hemispheres.</em></h2>
          <p>We are proud to be twinned with <strong>Hornsby Model Engineers</strong>, home of the Galston Valley Railway in New South Wales, Australia.</p>
          <div className="twinning-note"><Handshake aria-hidden="true"/><span><strong>Proudly twinned</strong> by friendship, craftsmanship and a shared love of miniature railways.</span></div>
          <a className="button twinning-link" href="https://www.hme.org.au/" target="_blank" rel="noreferrer" aria-label="Visit Hornsby Model Engineers (opens in a new tab)">Visit Hornsby Model Engineers <ArrowUpRight size={17}/></a>
        </div>
      </section>

      <section className="visit-panel">
        <div className="visit-image"><Image src="/images/entrance.webp" alt="Entrance to York Model Engineers" fill quality={35} sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="visit-copy"><p className="eyebrow">Your day on the rails</p><h2>Come curious.<br/><em>Leave inspired.</em></h2><div className="quick-facts"><p><MapPin/> Rear of The Pastures, North Lane · Dringhouses, York YO24 2JE</p><p><Sparkles/> Free entry · donations welcome</p><p><CalendarDays/> Public open days & special events</p><p><Users/> Wheelchair-friendly paths</p></div><div className="visit-actions"><a className="button brass" href="https://www.google.com/maps/dir/?api=1&amp;destination=53.94183%2C-1.11166" target="_blank" rel="noreferrer" aria-label="Get directions to the exact club entrance coordinates (opens in a new tab)">Get Directions <Navigation size={17}/></a><Link className="button ghost" href="/visitors">Visitor information <ArrowRight size={17}/></Link></div></div>
      </section>

      {nextEvent ? <section className="section event-tease"><p className="eyebrow dark">On the platform</p><div className="event-title"><span>{format(parseISO(nextEvent.start_date), "dd.MM.yy")}</span><h2>{nextEvent.name}</h2><p>{format(parseISO(nextEvent.start_date), "EEEE")} · {nextEvent.start_time.slice(0,5)}<br/>{nextEvent.is_ticket_required ? "Advance booking required" : "Free entrance & rides"}<br/>Hot food & drinks available</p></div><Link href="/events" className="circle-link" aria-label="See all events"><ArrowRight/></Link></section> : null}
    </PageShell>
  );
}
