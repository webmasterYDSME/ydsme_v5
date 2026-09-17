import styles from "./committee.module.css";
import { Mail, UserRound } from "lucide-react";
import Image from "next/image";
import { Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
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
  return <PageShell headerTheme="light">
    <section className={styles.roster} aria-labelledby="committee-heading">
      <header className={styles.intro}>
        <div><p className="eyebrow dark">Current committee</p><h1 id="committee-heading">The people<br/><em>behind the Society.</em></h1></div>
        <p>Meet the volunteers who help care for our Society. Get in touch with the relevant officer using the contact details below.</p>
      </header>
      {people.length ? <div className={styles.grid}>{people.map((person, index) =>
        <Reveal key={person.id} delay={Math.min(index * .05, .2)}>
          <article className={[styles.card, !person.name ? styles.vacant : ""].join(" ")}>
            <div className={[styles.portrait, !person.file_url ? styles.placeholder : ""].join(" ")}>
              {person.file_url ? <Image src={committeeImage(person.file_url)} alt={person.name || "Vacant committee position"} fill sizes="(max-width:600px) 100vw, (max-width:960px) 50vw, (max-width:1376px) 33vw, 406px"/> : <UserRound size={88} aria-hidden="true" strokeWidth={1}/>}
              {!person.name && <span className={styles.vacancyBadge}>Position vacant</span>}
            </div>
            <div className={styles.details}>
              <p className={styles.role}>{person.title}</p>
              <h2>{person.name || "Could this be you?"}</h2>
              {person.email && <a className={styles.contact} href={"mailto:" + person.email}><Mail size={17} aria-hidden="true"/><span>{person.email}</span></a>}
            </div>
          </article>
        </Reveal>
      )}</div> : <p className={styles.empty}>Committee details will be available here soon.</p>}
    </section>
  </PageShell>;
}
