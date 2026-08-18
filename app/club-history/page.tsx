import Image from "next/image";
import { Download, FileText } from "lucide-react";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Club History Since 1929",
  description: "Explore the history of York City & District Society of Model Engineers, from its 1929 founding to its permanent Dringhouses railway.",
  path: "/club-history",
  keywords: ["York model engineering history", "York railway history", "model engineering society 1929"],
});
const eras=[
 {year:"1923",title:"The first spark",text:"Model supplier H. P. Jackson placed an advert seeking like-minded York engineers. The first attempt did not take—but the idea stayed warm."},
 {year:"1929",title:"Thirty-six founders",text:"On 15 September, 36 people met in Micklegate and formed the York City and District Society of Model and Experimental Engineers. ‘Experimental’ was dropped in 1946."},
 {year:"1947",title:"Built by the Big Four",text:"After the war, a raised track was erected at Stockton Lane. Its rails were made by members in LNER workshops; parts still run in today’s Dringhouses track."},
 {year:"1949",title:"Bishopthorpe years",text:"Following the loss of Stockton Lane, a circular raised track, exhibitions and open days found a new home at Bishopthorpe. Membership grew to around 50."},
 {year:"1967",title:"Beside the main line",text:"Builder Jack Birch offered land at Moor Lane. Over 18 years members added a station, roofed steaming bay and a track familiar to observant East Coast passengers."},
 {year:"1989",title:"A permanent home",text:"The Society took possession of former railway sidings at Dringhouses after purchasing the land from British Rail. A clubhouse and track rose from ground deep in NER and LNER ash."},
 {year:"NOW",title:"Still in motion",text:"Nearly a century after that Micklegate meeting, new generations keep building, teaching and running—on land connected to York railways since Victorian times."}
];
export default function History(){return <PageShell><InnerHero kicker="Our story · 1929 to now" title={<>Forged in York.<br/><em>Still in motion.</em></>} copy="A Society carried through borrowed rooms, lost tracks, wartime workshops and sheer persistence to a permanent railway home." image="/images/history.jpg" imageAlt="Historic members of York Model Engineers with a miniature locomotive"/>
<section className="history-lead section"><div className="history-image"><Image src="/images/history.jpg" alt="Early members of York Model Engineers" fill sizes="(max-width:800px) 100vw, 45vw"/></div><div><p className="eyebrow dark">The long read</p><h2>We’ve always built<br/><em>the next chapter.</em></h2><p>The first club meetings were mostly discussion nights in public houses. But “Live Steam Nights” brought locomotives to a test bed, stationary engines to life—and even a flash-steam boat into action.</p><p>What follows is a story of ingenuity under pressure: every time the Society lost a home, its members stored the rails and started again.</p></div></section>
<section className="timeline"><div className="timeline-line"/>{eras.map((e,i)=><Reveal key={e.year}><article className="timeline-item"><div className="timeline-year">{e.year}</div><div className="timeline-dot"/><div><span>0{i+1}</span><h3>{e.title}</h3><p>{e.text}</p></div></article></Reveal>)}</section>
<section className="history-archive"><div><p className="eyebrow">From the archive</p><FileText aria-hidden="true"/></div><div><h2>Mr W. Shearman’s<br/><em>early history, 1929–1982.</em></h2><p>A six-page account copied from the notebook of a founding member, recording the Society’s workshops, tracks, setbacks and survival in remarkable detail.</p><a className="button brass" href="/documents/ydsme-1929-1982.pdf" target="_blank" rel="noreferrer">Read the original PDF <Download size={17}/></a></div></section>
<section className="history-note"><span>“</span><p>The railway runs on steel.<br/>The Society runs on people.</p><small>Edited highlights from notes by former secretary, chairman and newsletter editor Ken B.</small></section></PageShell>}
