"use client";

import { useState } from "react";

type Social = { name: string; link: string };
type Affiliate = { name: string; website: string; logo?: string };

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function EditableLinkLists({ initialSocials, initialAffiliates }: { initialSocials: Social[]; initialAffiliates: Affiliate[] }) {
  const [socials, setSocials] = useState(initialSocials);
  const [affiliates, setAffiliates] = useState(initialAffiliates);
  return <>
    <div className="wide settings-subsection"><h3>Social links</h3>{socials.map((social, index) => <div className="settings-pair" key={index}><label>Name<input name="social_name" value={social.name} onChange={event => setSocials(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} required/></label><label>URL<input type="url" name="social_link" value={social.link} onChange={event => setSocials(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, link: event.target.value } : item))}/></label><div className="row-actions"><button type="button" onClick={() => setSocials(items => move(items, index, -1))} aria-label={`Move ${social.name || "social link"} up`}>↑</button><button type="button" onClick={() => setSocials(items => move(items, index, 1))} aria-label={`Move ${social.name || "social link"} down`}>↓</button><button type="button" onClick={() => setSocials(items => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></div>)}<button type="button" onClick={() => setSocials(items => [...items, { name: "", link: "" }])}>Add social link</button></div>
    <div className="wide settings-subsection"><h3>Affiliates</h3>{affiliates.map((affiliate, index) => <div className="settings-pair" key={index}><label>Name<input name="affiliate_name" value={affiliate.name} onChange={event => setAffiliates(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} required/></label><label>Website<input type="url" name="affiliate_website" value={affiliate.website} onChange={event => setAffiliates(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, website: event.target.value } : item))}/></label><input type="hidden" name="affiliate_logo" value={affiliate.logo || ""}/><div className="row-actions"><button type="button" onClick={() => setAffiliates(items => move(items, index, -1))}>↑</button><button type="button" onClick={() => setAffiliates(items => move(items, index, 1))}>↓</button><button type="button" onClick={() => setAffiliates(items => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></div>)}<button type="button" onClick={() => setAffiliates(items => [...items, { name: "", website: "", logo: "" }])}>Add affiliate</button></div>
  </>;
}
