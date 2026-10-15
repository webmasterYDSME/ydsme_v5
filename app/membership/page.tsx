import { redirect } from "next/navigation";
import { ArrowRight, Check, KeyRound, Wrench } from "lucide-react";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { getPublicMembershipPlans } from "@/lib/membership";
import { publicPageMetadata } from "@/lib/seo";
import { getPublicSiteConfig } from "@/lib/data";
import styles from "./overview.module.css";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Membership & How to Join",
  description: "Join York Model Engineers: a community for people interested in model engineering, clocks, tools, working machinery and miniature railways.",
  path: "/membership",
  keywords: ["join model engineering club", "York Model Engineers membership", "model railway club York"],
});

function pounds(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(pence / 100);
}

const planOrder = new Map([["adult", 0], ["concession", 1], ["student", 2], ["junior", 3]]);

export default async function Membership({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const query = await searchParams;
  const enabled = await membershipBillingEnabled();
  const siteConfig = await getPublicSiteConfig();
  if (enabled && query.application) redirect(`/membership/apply?application=${encodeURIComponent(query.application)}`);
  const plans = enabled ? [...await getPublicMembershipPlans()].sort((a, b) => (planOrder.get(a.slug) ?? 9) - (planOrder.get(b.slug) ?? 9)) : [];
  const year = plans[0]?.membership_year ?? new Date().getFullYear();

  return <PageShell><div className={styles.overview}>
    <InnerHero kicker="Become a member" title={<>Bring your<br/><em>curiosity.</em></>} copy="Meet others who enjoy making things, understanding how they work and sharing practical skills." image="/images/engine.webp" imageAlt="A live-steam locomotive at York Model Engineers" imageTone="bright"><div className="button-row"><a className="button brass" href={enabled ? "/membership/apply" : MEMBERMOJO_MEMBERSHIP_URL}>{enabled ? "Apply to join" : "Join or renew"}<ArrowRight size={17}/></a><a className="button ghost" href={`mailto:${siteConfig.email}?subject=Membership%20enquiry`}>Ask about membership</a>{plans.length ? <a className="button ghost" href="#membership-options">Explore membership options</a> : null}</div></InnerHero>
    <section className="section membership-lead"><div><p className="eyebrow dark">Making, learning & sharing</p><h2>Ideas, skills<br/>& <em>good company.</em></h2></div><div><p>Whether your interest is clocks, machining, engines or railways, meet people who love solving practical problems and sharing what they learn.</p><ul><li><Check/>Member-only events and running days</li><li><Check/>Learn from experienced model engineers</li><li><Check/>Share ideas, projects and practical experience</li><li><Check/>A welcoming home for traditional and modern making</li></ul></div></section>
    <section className={`section ${styles.questions}`} aria-labelledby="membership-questions"><div><p className="eyebrow dark">Before you join</p><h2 id="membership-questions">Start with a <em>conversation.</em></h2></div><div><p>Curious about joining, but not sure where to start? Tell us what interests you and what you would like to make or learn.</p><p>Ask about meeting members before applying, activities you can attend and whether you need your own tools or workspace. We can explain current facilities and any introductions or supervision needed to use equipment.</p><a className="text-link" href={`mailto:${siteConfig.email}?subject=Membership%20enquiry`}>Ask about membership <ArrowRight size={16}/></a></div></section>
    {plans.length ? <section className={styles.options} id="membership-options" aria-labelledby="membership-options-title"><header className={styles.optionsHeading}><div><p className="eyebrow dark">Find your place</p><h2 id="membership-options-title">Your next <em>chapter.</em></h2></div><p>Annual membership options<br/>Membership year ends 31 December {year}</p></header><div className="tier-grid">{plans.map((plan, index) => <Reveal key={plan.id} delay={index * .05}><article className={plan.slug === "adult" ? "tier featured" : "tier"}><div className="tier-top"><span>0{index + 1}</span>{plan.slug === "adult" ? <b>MOST POPULAR</b> : <Wrench/>}</div><h3 className={styles.planName}>{plan.name}</h3><p className={styles.price}>{pounds(plan.amount_pence)}<small>/ year</small></p><p className={styles.description}>{plan.description}</p></article></Reveal>)}</div></section> : null}
    <section className="join-panel"><div><KeyRound/><p className="eyebrow">Membership year ends 31 December {year}</p><h2>Join the<br/><em>society.</em></h2><p>Bring your curiosity, share your skills and become part of York&apos;s model engineering community.</p></div><a className="button brass large" href={enabled ? "/membership/apply" : MEMBERMOJO_MEMBERSHIP_URL}>{enabled ? "Apply to join" : "Join or renew"} <ArrowRight/></a></section>
  </div></PageShell>;
}
