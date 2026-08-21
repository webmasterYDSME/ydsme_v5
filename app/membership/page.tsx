import { redirect } from "next/navigation";
import { ArrowRight, Check, KeyRound, Wrench } from "lucide-react";
import { InnerHero, Reveal } from "../components/RailSite";
import { PageShell } from "../components/PageShell";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";
import { getPublicMembershipPlans } from "@/lib/membership";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "Membership & How to Join",
  description: "Join York Model Engineers for member running days, workshops, shared facilities and a welcoming community of traditional and modern makers.",
  path: "/membership",
  keywords: ["join model engineering club", "York Model Engineers membership", "model railway club York"],
});

function pounds(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(pence / 100);
}

const planOrder = new Map([["adult", 0], ["concession", 1], ["student", 2], ["junior", 3]]);

export default async function Membership({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const query = await searchParams;
  const enabled = membershipBillingEnabled();
  if (enabled && query.application) redirect(`/membership/apply?application=${encodeURIComponent(query.application)}`);
  const plans = enabled ? (await getPublicMembershipPlans()).sort((a, b) => (planOrder.get(a.slug) ?? 9) - (planOrder.get(b.slug) ?? 9)) : [];
  const year = plans[0]?.membership_year ?? new Date().getFullYear();

  return <PageShell>
    <InnerHero kicker="Become a member" title={<>Don’t just watch.<br/><em>Make it move.</em></>} copy="Join a generous community of makers, drivers, fixers and lifelong learners—with nearly five acres to explore." image="/images/engine.webp" imageAlt="A live-steam locomotive at York Model Engineers" imageTone="bright"/>
    <section className="section membership-lead"><div><p className="eyebrow dark">Your workshop gets bigger</p><h2>Tools, tracks<br/>& <em>good company.</em></h2></div><div><p>Membership opens up member-only running days, workshops, events and the collective knowledge of people who love solving practical problems.</p><ul><li><Check/>Member-only events and running days</li><li><Check/>Learn from experienced model engineers</li><li><Check/>Use and help shape our unique facilities</li><li><Check/>A welcoming home for traditional and modern making</li></ul></div></section>
    {plans.length ? <section className="tier-grid">{plans.map((plan, index) => <Reveal key={plan.id} delay={index * .05}><article className={plan.slug === "adult" ? "tier featured" : "tier"}><div className="tier-top"><span>0{index + 1}</span><Wrench/></div><p>{plan.name}</p><h3>{pounds(plan.amount_pence)}<small>/ year</small></h3><p>{plan.description}</p>{plan.slug === "adult" ? <b>MOST POPULAR</b> : null}</article></Reveal>)}</section> : null}
    <section className="join-panel"><div><KeyRound/><p className="eyebrow">Membership year ends 31 December {year}</p><h2>Ready to come<br/><em>aboard?</em></h2><p>Bring your curiosity, share your skills and become part of York&apos;s model engineering community.</p></div><a className="button brass large" href={enabled ? "/membership/apply" : MEMBERMOJO_MEMBERSHIP_URL}>{enabled ? "Apply to join" : "Join or renew"} <ArrowRight/></a></section>
  </PageShell>;
}
