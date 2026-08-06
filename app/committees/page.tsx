import { Mail } from "lucide-react";
import Image from "next/image";
import { InnerHero, PageShell, Reveal } from "../components/RailSite";
const people=[
 ["David Woods","Chairman","chairman@yorkmodelengineers.co.uk","/images/david-woods.webp"],
 ["Brian Smyth","Vice Chairman","vicechairman@yorkmodelengineers.co.uk","/images/brian-smyth.webp"],
 ["Glyn Granger","Treasurer","treasurer@yorkmodelengineers.co.uk","/images/glyn-granger.webp"],
 ["Clifford Hudson","Secretary","secretary@yorkmodelengineers.co.uk","/images/clifford-hudson.jpg"],
 ["Keith Walton","Boiler Inspector","boilerinspector@yorkmodelengineers.co.uk","/images/keith-walton.webp"],
];
export default function Committees(){return <PageShell><InnerHero kicker="The people at the points" title={<>Meet the crew<br/><em>behind the railway.</em></>} copy="A volunteer committee bringing expertise, care and commitment to every part of Society life." image="/images/track.webp"/>
<section className="section committee-intro"><p className="eyebrow dark">2026 committee</p><h2>Stewards of the site.<br/><em>Champions of the craft.</em></h2></section><section className="people-grid">{people.map((p,i)=><Reveal key={p[0]} delay={i*.05}><article className="person"><div className="portrait"><Image src={p[3]} alt={p[0]} fill sizes="(max-width:700px) 100vw, 33vw"/></div><span>0{i+1}</span><h3>{p[0]}</h3><p>{p[1]}</p><a href={`mailto:${p[2]}`} aria-label={`Email ${p[0]}`}><Mail size={18}/>{p[2]}</a></article></Reveal>)}<Reveal><article className="person vacant"><div><span>06</span><p>Newsletter Editor</p><h3>Could this<br/>be you?</h3></div><a href="mailto:editor@yorkmodelengineers.co.uk"><Mail size={18}/>editor@yorkmodelengineers.co.uk</a></article></Reveal></section></PageShell>}
