import { ArrowRight, ArrowUpRight, CalendarDays, Gauge, Globe2, Handshake, MapPin, Navigation, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { InteractiveSteamTrain, Reveal, SectionHeading } from "./components/RailSite";
import { PageShell } from "./components/PageShell";
import { TargetDonation } from "./components/DonationCards";
import { getCarriageAnnouncements, getDonationSettings, getPublicEvents } from "@/lib/data";
import { publicPageMetadata } from "@/lib/seo";
import { getPublicFeaturedProjects } from "@/lib/public-projects";
import styles from "./home.module.css";

// Public database content is resolved at request time. This keeps builds
// independent from a live Supabase schema and avoids caching operational data.
export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Engineering, Making & Community",
  description: "Discover model engineering, clockmaking, workshop skills and working machines in York. Explore members’ projects, events and ways to get involved.",
  path: "/",
  keywords: ["engineering society York", "clockmaking York", "workshop skills", "family days out York"],
});

const interests = [
  { name: "Machining & tools", detail: "The tools, techniques and practical problem-solving behind a working model." },
  { name: "Clocks & mechanisms", detail: "The precision and patience behind clockmaking, gears and mechanical movement." },
  { name: "Engines & machinery", detail: "Stationary engines, traction engines and the parts that bring machines to life." },
  { name: "Woodworking & model making", detail: "Decorative woodworking, kit building and the craft of making in miniature." },
  { name: "3D printing", detail: "Digital design and new ways to turn an idea into a physical part." },
  { name: "Model railways", detail: "From 16mm and Gauge 1 models to 2.5–7.25 inch locomotives." },
  { name: "Brook Moor Railway", detail: "Our G gauge railway: another way to explore engineering in miniature.", isNew: true },
];

export default async function Home() {
  const [publicEvents, donations, announcements, projects] = await Promise.all([getPublicEvents(), getDonationSettings(), getCarriageAnnouncements(1), getPublicFeaturedProjects(3)]);
  const nextEvent = publicEvents.find((event) => event.display_in_homepage) ?? publicEvents[0];
  return (
    <PageShell>
      <div className={styles.home}>
      <section className="hero" aria-labelledby="home-hero-title">
        <Image src="/images/workshop-banner.png" alt="Illustration of a model engineer working at a lathe, surrounded by tools and mechanical parts" fill loading="eager" fetchPriority="low" quality={55} sizes="(max-width: 900px) 1800px, 100vw" style={{ objectPosition: "35% center" }} />
        <div className="hero-wash" />
        <div className="steam steam-one" /><div className="steam steam-two" /><div className="steam steam-three" />
        <div className="hero-copy">
          <p className="eyebrow">York · Since 1929</p>
          <h1 id="home-hero-title">For people who love<br/><em>making things work.</em></h1>
          <p className="hero-lede">York Model Engineers brings together people interested in model engineering, clockmaking, tools and working machinery. Discover what our members make, share practical skills and meet others who enjoy turning ideas into working projects.</p>
          <div className="button-row"><a className="button brass" href="#what-we-do">Explore what we do <ArrowRight size={17}/></a><Link className="button ghost" href="/visitors">Plan a visit</Link></div>
        </div>
        {nextEvent ? <Link className="next-running-badge" href="/events"><span className="next-running-kicker"><i aria-hidden="true"/> Next public event</span><time className="next-running-date" dateTime={`${nextEvent.start_date}T${nextEvent.start_time.slice(0,5)}`}><strong>{format(parseISO(nextEvent.start_date), "dd")}</strong><span>{format(parseISO(nextEvent.start_date), "MMM").toUpperCase()}<small>{format(parseISO(nextEvent.start_date), "yyyy")}</small></span></time><span className="next-running-name">{nextEvent.name}</span><span className="next-running-detail">{format(parseISO(nextEvent.start_date), "EEE")} · {nextEvent.start_time.slice(0,5)}</span><span className="next-running-arrow" aria-hidden="true"><ArrowUpRight/></span></Link> : null}
        <div className="track-line"><InteractiveSteamTrain announcements={announcements.map(({ id, title, body }) => ({ id, title, body }))}/></div>
      </section>

      <section className="ticker" aria-label="Club highlights"><div>MODEL ENGINEERING <i/> CLOCKS &amp; MECHANISMS <i/> WORKSHOP SKILLS <i/> MINIATURE RAILWAYS <i/> MAKING &amp; COMMUNITY <i/> OPEN DAYS <i/> LIVE STEAM</div></section>

      <section className="section intro-grid" id="what-we-do">
        <Reveal><div><p className="eyebrow dark">A community of makers</p><SectionHeading>Making things.<br/>Sharing <em>skills.</em></SectionHeading></div></Reveal>
        <Reveal delay={0.12}><div className="intro-copy"><p className="large-copy">A community for people who enjoy making things, understanding how they work and sharing practical skills.</p><p>From clocks and mechanisms to engines and miniature railways, our interests meet in the pleasure of turning ideas into working projects. Our railway is one of the finest showcases of that engineering, set in nearly five acres in Dringhouses.</p><Link className="text-link" href="/club-history">Discover our story <ArrowRight size={16}/></Link></div></Reveal>
      </section>

      <section className="section" aria-labelledby="interests-title">
        <Reveal><div className="section-heading-row"><div><p className="eyebrow dark">What we do</p><h2 className="section-heading" id="interests-title">Explore our <em>interests.</em></h2></div><p>Model engineering brings together many kinds of making. Explore the tools, materials and mechanisms that turn ideas into working projects.</p></div></Reveal>
        <div className="interest-rail">{interests.map((item, i)=><Reveal key={item.name} delay={i*.04}><div className={item.isNew ? "interest interest-new" : "interest"}><span className="interest-number">{String(i+1).padStart(2,"0")}</span><div className="interest-copy"><div className="interest-title-row"><p>{item.name}</p>{item.isNew ? <span className="interest-new-badge"><Sparkles aria-hidden="true"/>New</span> : null}</div>{item.detail ? <small>{item.detail}</small> : null}</div><Gauge className="interest-gauge" size={18}/></div></Reveal>)}</div>
      </section>

      <section className="section intro-grid" aria-labelledby="making-title">
        <div><p className="eyebrow dark">From the workbench</p><h2 className="section-heading" id="making-title">What members<br/>are <em>making.</em></h2></div>
        <div className="intro-copy"><p className="large-copy">Builds, experiments, repairs and restorations: every project has a story.</p><p>Explore the tools and techniques behind members’ work, the problems they tackled and how they approached them. Our public showcase shares completed projects with their owners’ permission.</p>
          {projects.length ? <ul className={styles.projectLinks}>{projects.map(project => <li key={project.project_id}><Link href={`/projects/${project.slug}`}>{project.title}<ArrowUpRight size={18}/></Link><p>{project.summary}</p></li>)}</ul> : <p>The first public project stories are being prepared.</p>}
          <Link className="text-link" href="/projects">Explore members’ projects <ArrowRight size={16}/></Link>
        </div>
      </section>

      <section className="section intro-grid" aria-labelledby="skills-title">
        <div><p className="eyebrow dark">Skills &amp; knowledge</p><h2 className="section-heading" id="skills-title">Curiosity.<br/>Craft. <em>Good company.</em></h2></div>
        <div className="intro-copy"><p className="large-copy">Meet people who enjoy making things work.</p><p>A workshop can be a place to make, a demonstration or a member’s own workspace. Ask us about current activities, facilities and any introductions or supervision needed before planning to use equipment.</p><p>Whether your interest is clocks, machining or railways, there is a conversation to start.</p><Link className="text-link" href="/membership">Find out about membership <ArrowRight size={16}/></Link></div>
      </section>

      <section className="feature-photo">
        <Image src="/images/track.webp" alt="Miniature railway track through the club grounds" fill quality={35} sizes="100vw" />
        <div className="feature-card"><span className="counter">03</span><h2>Visit our<br/>miniature railways.</h2><p>Three railways, one remarkable site. Raised and ground-level tracks engineered for locomotives from 2.5&quot; to 7.25&quot; gauge—a living showcase of members’ skill.</p><Link className="text-link" href="/visitors">Plan a railway visit <ArrowRight size={16}/></Link></div>
      </section>

      <TargetDonation campaign={donations.target} />

      <section className="visit-panel">
        <div className="visit-image"><Image src="/images/entrance.webp" alt="Entrance to York Model Engineers" fill quality={35} sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="visit-copy"><p className="eyebrow">Visit our miniature railways</p><h2>Come curious.<br/><em>Leave inspired.</em></h2><div className="quick-facts"><p><MapPin/> Rear of The Pastures, North Lane · Dringhouses, York YO24 2JE</p><p><Sparkles/> Free entry · donations welcome</p><p><CalendarDays/> Public open days & special events</p><p><Users/> Wheelchair-friendly paths</p></div><div className="visit-actions"><a className="button brass" href="https://www.google.com/maps/dir/?api=1&amp;destination=53.94183%2C-1.11166" target="_blank" rel="noreferrer" aria-label="Get directions to the exact club entrance coordinates (opens in a new tab)">Get Directions <Navigation size={17}/></a><Link className="button ghost" href="/visitors">Visitor information <ArrowRight size={17}/></Link></div></div>
      </section>

      {nextEvent ? <section className="section event-tease"><p className="eyebrow dark">Dates for your diary</p><div className="event-title"><span>{format(parseISO(nextEvent.start_date), "dd.MM.yy")}</span><h2>{nextEvent.name}</h2><p>{format(parseISO(nextEvent.start_date), "EEEE")} · {nextEvent.start_time.slice(0,5)}<br/>{nextEvent.is_ticket_required ? "Advance booking required" : "Free entrance & rides"}<br/>See the event details before visiting</p></div><Link href="/events" className="button dark">See all events <ArrowRight size={17}/></Link></section> : null}
      <section className="section intro-grid" aria-labelledby="join-title"><div><p className="eyebrow dark">Get involved</p><h2 className="section-heading" id="join-title">Bring your <em>curiosity.</em></h2></div><div className="intro-copy"><p className="large-copy">Share your skills and become part of York’s model engineering community.</p><p>Explore membership, see what is coming up, or get in touch to find out more.</p><div className="button-row"><Link className="button dark" href="/membership">Join the society <ArrowRight size={17}/></Link><Link className="text-link" href="/events">Events &amp; visits <ArrowRight size={16}/></Link></div></div></section>

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
          <div className={styles.twinningIdentity}>
            <Image src="/hornsby-logo.png" alt="Hornsby Model Engineers Co-operative Ltd" width={104} height={104} sizes="(max-width: 700px) 80px, 104px" quality={75}/>
            <p className="eyebrow">Friends across the world</p>
          </div>
          <h2 id="twinning-title">One craft.<br/><em>Two hemispheres.</em></h2>
          <p>We are proud to be twinned with <strong>Hornsby Model Engineers</strong>, home of the Galston Valley Railway in New South Wales, Australia.</p>
          <div className="twinning-note"><Handshake aria-hidden="true"/><span><strong>Proudly twinned</strong> by friendship, craftsmanship and a shared love of miniature railways.</span></div>
          <a className="button twinning-link" href="https://www.hme.org.au/" target="_blank" rel="noreferrer" aria-label="Visit Hornsby Model Engineers (opens in a new tab)">Visit Hornsby Model Engineers <ArrowUpRight size={17}/></a>
        </div>
      </section>

      </div>
    </PageShell>
  );
}
