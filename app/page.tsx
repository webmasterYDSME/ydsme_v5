import { ArrowRight, CalendarDays, Gauge, MapPin, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageShell, Reveal, SectionHeading } from "./components/RailSite";

const interests = [
  "2.5–7.25 inch locomotives", "Stationary engines", "Traction engines",
  "16mm & Gauge 1 railways", "Decorative woodworking", "Clocks & mechanisms",
  "Kit building & 3D printing",
];

export default function Home() {
  return (
    <PageShell>
      <section className="hero">
        <Image src="/images/hero.webp" alt="A miniature steam locomotive at York Model Engineers" fill priority sizes="100vw" />
        <div className="hero-wash" />
        <div className="steam steam-one" /><div className="steam steam-two" /><div className="steam steam-three" />
        <div className="hero-copy">
          <Reveal><p className="eyebrow">York · Since 1929</p></Reveal>
          <Reveal delay={0.12}><h1>Small engines.<br/><em>Grand adventures.</em></h1></Reveal>
          <Reveal delay={0.22}><p className="hero-lede">Five woodland acres. Three miniature railways. Generations of makers keeping steam, skill and wonder in motion.</p></Reveal>
          <Reveal delay={0.32}><div className="button-row"><Link className="button brass" href="/visitors">Plan your visit <ArrowRight size={17}/></Link><Link className="button ghost" href="/membership">Join the society</Link></div></Reveal>
        </div>
        <div className="hero-stamp"><span>Next public running</span><strong>26</strong><small>JUL · 10:00</small></div>
        <div className="track-line"><div className="train-marker">Y</div></div>
      </section>

      <section className="ticker" aria-label="Club highlights"><div>FREE ENTRY <i/> FREE RIDES <i/> OPEN DAYS <i/> LIVE STEAM <i/> YORK’S HIDDEN RAILWAY <i/> FREE ENTRY <i/> FREE RIDES <i/> OPEN DAYS <i/> LIVE STEAM</div></section>

      <section className="section intro-grid">
        <Reveal><div><p className="eyebrow dark">Welcome aboard</p><SectionHeading>Engineering,<br/>but make it <em>magic.</em></SectionHeading></div></Reveal>
        <Reveal delay={0.12}><div className="intro-copy"><p className="large-copy">Alongside the East Coast Main Line in Dringhouses sits an unexpected world of polished brass, coal smoke and precisely profiled steel rail.</p><p>We’re a friendly society of model engineers and artisans, maintaining nearly five acres of landscaped woodland where ideas become working machines.</p><Link className="text-link" href="/club-history">Read our 97-year story <ArrowRight size={16}/></Link></div></Reveal>
      </section>

      <section className="feature-photo">
        <Image src="/images/track.webp" alt="Miniature railway track through the club grounds" fill sizes="100vw" />
        <div className="feature-card"><span className="counter">03</span><h2>Railways,<br/>one remarkable site</h2><p>Raised and ground-level tracks engineered for locomotives from 2.5&quot; to 7.25&quot; gauge.</p></div>
      </section>

      <section className="section">
        <Reveal><div className="section-heading-row"><SectionHeading>Find your <em>fascination.</em></SectionHeading><p>Old-school craft meets new-school making. There is always another skill to learn—and someone happy to share it.</p></div></Reveal>
        <div className="interest-rail">{interests.map((item, i)=><Reveal key={item} delay={i*.04}><div className="interest"><span>{String(i+1).padStart(2,"0")}</span><p>{item}</p><Gauge size={18}/></div></Reveal>)}</div>
      </section>

      <section className="visit-panel">
        <div className="visit-image"><Image src="/images/entrance.webp" alt="Entrance to York Model Engineers" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="visit-copy"><p className="eyebrow">Your day on the rails</p><h2>Come curious.<br/><em>Leave inspired.</em></h2><div className="quick-facts"><p><MapPin/> Dringhouses, York · YO24 2JE</p><p><Sparkles/> Free entry · donations welcome</p><p><CalendarDays/> Public open days & special events</p><p><Users/> Wheelchair-friendly paths</p></div><Link className="button brass" href="/visitors">Visitor information <ArrowRight size={17}/></Link></div>
      </section>

      <section className="section event-tease"><p className="eyebrow dark">On the platform</p><div className="event-title"><span>26.07.26</span><h2>Monthly Public<br/><em>Open Day</em></h2><p>Sunday · 10:00<br/>Free entrance & rides<br/>Hot food & drinks available</p></div><Link href="/events" className="circle-link" aria-label="See all events"><ArrowRight/></Link></section>
    </PageShell>
  );
}
