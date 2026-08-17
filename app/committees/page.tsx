import { Mail } from "lucide-react";
import Image from "next/image";
import { InnerHero, PageShell, Reveal } from "../components/RailSite";
import { committeeImage, getCommittees } from "@/lib/data";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Committee & Society Officers",
  description: "Meet the volunteer committee and officers responsible for York Model Engineers, its railway site and Society activities.",
  path: "/committees",
  keywords: ["York Model Engineers committee", "model engineering society officers"],
});

export default async function Committees() {
  const people = await getCommittees();
  return <PageShell><InnerHero kicker="The people at the points" title={<>Meet the crew<br/><em>behind the railway.</em></>} copy="A volunteer committee bringing expertise, care and commitment to every part of Society life." image="/images/track.webp" imageAlt="Miniature railway tracks maintained by York Model Engineers"/>
    <section className="section committee-intro"><p className="eyebrow dark">Current committee</p><h2>Stewards of the site.<br/><em>Champions of the craft.</em></h2></section>
    <section className="people-grid">{people.map((person,index)=><Reveal key={person.id} delay={index*.05}><article className={`person ${!person.name ? "vacant" : ""}`}><div className="portrait"><Image src={committeeImage(person.file_url)} alt={person.name || `Vacant ${person.title} position`} fill sizes="(max-width:700px) 100vw, 33vw"/></div><span>{String(index+1).padStart(2,"0")}</span><h3>{person.name || "Position vacant"}</h3><p>{person.title}</p><a href={`mailto:${person.email}`}><Mail size={18}/>{person.email}</a></article></Reveal>)}</section>
  </PageShell>;
}
