import { ArrowRight, CalendarDays, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { InnerHero, PageShell, Reveal } from "../components/RailSite";
const events=[
 {date:"19",month:"JUL",type:"Member only",title:"Scarborough Railway Society visit",text:"A visiting society joins us for a day of friendship, modelling and plenty of running.",time:"10:00"},
 {date:"25",month:"JUL",type:"Member only",title:"Woodies Bits & Pieces Evening",text:"An evening of interesting artefacts, machines and lively workshop chat.",time:"19:00"},
 {date:"02",month:"AUG",type:"Member only",title:"Members Running Day",text:"Bring a locomotive or simply come along and enjoy a full day on site.",time:"10:00"},
];
export default function Events(){return <PageShell><InnerHero kicker="The 2026 running board" title={<>What’s next<br/><em>down the line.</em></>} copy="Public open days, visiting societies and members’ running days—mark the dates and join us trackside." image="/images/engine.webp"/>
<section className="section featured-event"><div className="big-date"><strong>26</strong><span>JUL<br/>2026</span></div><div><p className="eyebrow dark">Next departure · Public event</p><h2>Monthly public<br/><em>open day</em></h2><p>It’s Sunday, it’s summer—come to Dringhouses for a joyful day of miniature train rides. Entrance and rides are free for all, with hot food and drinks available.</p><div className="event-meta"><span><CalendarDays/>Sunday</span><span>10:00</span><span>Free</span></div></div><div className="signal"><i/><i/><i className="lit"/></div></section>
<section className="events-list"><div className="events-label"><span>MORE DEPARTURES</span><span>YORK · 2026</span></div>{events.map((e,i)=><Reveal key={e.title} delay={i*.06}><article className="event-row"><div className="event-date"><strong>{e.date}</strong><span>{e.month}</span></div><div><p className="eyebrow dark"><LockKeyhole size={13}/>{e.type}</p><h3>{e.title}</h3><p>{e.text}</p></div><time>{e.time}</time><ArrowRight/></article></Reveal>)}</section>
<section className="member-banner"><p className="eyebrow">Beyond the public timetable</p><h2>More days. More making.<br/><em>Members get the keys.</em></h2><Link href="/membership" className="button brass">Explore membership <ArrowRight size={17}/></Link></section></PageShell>}
