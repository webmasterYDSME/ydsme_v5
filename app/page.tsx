import { ArrowRight, ArrowUpRight, CalendarDays, Gauge, MapPin, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InteractiveSteamTrain, PageShell, Reveal, SectionHeading } from "./components/RailSite";
import { TargetDonation } from "./components/DonationCards";
import { getDonationSettings, getPublicEvents } from "@/lib/data";
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
  "2.5–7.25 inch locomotives", "Stationary engines", "Traction engines",
  "16mm & Gauge 1 railways", "Decorative woodworking", "Clocks & mechanisms",
  "Kit building & 3D printing",
];

export default async function Home() {
  const [publicEvents, donations] = await Promise.all([getPublicEvents(), getDonationSettings()]);
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
        <div className="track-line"><InteractiveSteamTrain/></div>
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
        <div className="interest-rail">{interests.map((item, i)=><Reveal key={item} delay={i*.04}><div className="interest"><span>{String(i+1).padStart(2,"0")}</span><p>{item}</p><Gauge size={18}/></div></Reveal>)}</div>
      </section>

      <section className="visit-panel">
        <div className="visit-image"><Image src="/images/entrance.webp" alt="Entrance to York Model Engineers" fill quality={35} sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="visit-copy"><p className="eyebrow">Your day on the rails</p><h2>Come curious.<br/><em>Leave inspired.</em></h2><div className="quick-facts"><p><MapPin/> Dringhouses, York · YO24 2JE</p><p><Sparkles/> Free entry · donations welcome</p><p><CalendarDays/> Public open days & special events</p><p><Users/> Wheelchair-friendly paths</p></div><Link className="button brass" href="/visitors">Visitor information <ArrowRight size={17}/></Link></div>
      </section>

      {nextEvent ? <section className="section event-tease"><p className="eyebrow dark">On the platform</p><div className="event-title"><span>{format(parseISO(nextEvent.start_date), "dd.MM.yy")}</span><h2>{nextEvent.name}</h2><p>{format(parseISO(nextEvent.start_date), "EEEE")} · {nextEvent.start_time.slice(0,5)}<br/>{nextEvent.is_ticket_required ? "Advance booking required" : "Free entrance & rides"}<br/>Hot food & drinks available</p></div><Link href="/events" className="circle-link" aria-label="See all events"><ArrowRight/></Link></section> : null}
    </PageShell>
  );
}
