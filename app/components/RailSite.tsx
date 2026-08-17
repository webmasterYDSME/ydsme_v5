"use client";

import {ReactNode, useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const nav = [["Visitors","/visitors"],["Events","/events"],["Our story","/club-history"],["Committee","/committees"],["Membership","/membership"]];

export function Reveal({children, delay=0}:{children:ReactNode;delay?:number}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ gsap.registerPlugin(ScrollTrigger); const el=ref.current; if(!el)return; const tween=gsap.fromTo(el,{y:42,opacity:0},{y:0,opacity:1,duration:1,delay,ease:"power3.out",scrollTrigger:{trigger:el,start:"top 88%",once:true}}); return()=>{tween.kill();};},[delay]);
  return <div ref={ref} className="reveal">{children}</div>;
}

export function SectionHeading({children}:{children:ReactNode}) { return <h2 className="section-heading">{children}</h2>; }

export function PageShell({children}:{children:ReactNode}) {
  const path=usePathname(); const [open,setOpen]=useState(false);
  return <>
    <header className="site-header">
      <Link href="/" className="brand"><span className="brand-logo"><Image src="/ydsme-logo.png" alt="York City and District Society of Model Engineers" width={76} height={76} priority /></span><span>York Model<br/><b>Engineers</b></span></Link>
      <nav className={open?"main-nav open":"main-nav"}>{nav.map(([label,href])=><Link key={href} className={path===href?"active":""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<Link className="login-mobile" href="/signin">Member login <ArrowUpRight size={15}/></Link></nav>
      <Link className="member-login" href="/signin">Member login <ArrowUpRight size={15}/></Link>
      <button className="menu-button" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</button>
    </header>
    <main>{children}</main>
    <footer><div className="footer-brand"><span className="brand-logo footer-logo"><Image src="/ydsme-logo.png" alt="York City and District Society of Model Engineers" width={92} height={92} /></span><h2>Made by hand.<br/><em>Moved by steam.</em></h2></div><div><h3>Visit</h3><p>Dringhouses<br/>York · YO24 2JE</p><a href="mailto:secretary@yorkmodelengineers.co.uk">secretary@yorkmodelengineers.co.uk</a></div><div><h3>Explore</h3>{nav.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}<a href="https://www.facebook.com/YorkModelEngineers">Facebook</a></div><div className="footer-small"><p>York City & District Society<br/>of Model Engineers Limited<br/>Company no. 26478R</p><p>© 2026 YCDSME</p></div></footer>
  </>;
}

export function InnerHero({kicker,title,copy,image}:{kicker:string;title:ReactNode;copy:string;image:string}) {
  return <section className="inner-hero"><div className="inner-photo" style={{backgroundImage:`linear-gradient(90deg,rgba(5,12,9,.96) 0%,rgba(7,16,12,.76) 52%,rgba(7,16,12,.34) 100%),url(${image})`}}/><div className="inner-copy"><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{copy}</p></div><div className="vertical-label">YORK · ENGLAND · EST 1929</div></section>;
}
