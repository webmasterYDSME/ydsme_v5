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
  useEffect(()=>{
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    document.documentElement.classList.toggle("nav-open",open);
    window.addEventListener("keydown",closeOnEscape);
    return()=>{document.documentElement.classList.remove("nav-open");window.removeEventListener("keydown",closeOnEscape);};
  },[open]);
  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header">
      <Link href="/" className="brand"><span className="brand-logo"><Image src="/ydsme-logo.png" alt="York City and District Society of Model Engineers" width={76} height={76} priority /></span><span>York Model<br/><b>Engineers</b></span></Link>
      <nav id="primary-navigation" aria-label="Primary navigation" className={open?"main-nav open":"main-nav"}>{nav.map(([label,href])=><Link key={href} className={path===href?"active":""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<Link className="login-mobile" href="/signin" onClick={()=>setOpen(false)}>Member login <ArrowUpRight size={15}/></Link></nav>
      <Link className="member-login" href="/signin">Member login <ArrowUpRight size={15}/></Link>
      <button className="menu-button" type="button" onClick={()=>setOpen(!open)} aria-controls="primary-navigation" aria-expanded={open} aria-label={open?"Close navigation":"Open navigation"}>{open?<X/>:<Menu/>}</button>
    </header>
    <main id="main-content">{children}</main>
    <footer><div className="footer-brand"><span className="brand-logo footer-logo"><Image src="/ydsme-logo.png" alt="" width={92} height={92} /></span><h2>Made by hand.<br/><em>Moved by steam.</em></h2></div><div><h3>Visit</h3><address>Dringhouses<br/>York · YO24 2JE</address><a className="footer-email" href="mailto:secretary@yorkmodelengineers.co.uk">secretary@yorkmodelengineers.co.uk</a></div><nav aria-label="Footer navigation"><h3>Explore</h3>{nav.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}<a href="https://www.facebook.com/YorkModelEngineers">Facebook</a></nav><div className="footer-small"><p>York City & District Society<br/>of Model Engineers Limited<br/>Company no. 26478R</p><p>© 2026 YCDSME</p></div></footer>
  </>;
}

export function InnerHero({kicker,title,copy,image,imageAlt}:{kicker:string;title:ReactNode;copy:string;image:string;imageAlt:string}) {
  return <section className="inner-hero" aria-labelledby="inner-hero-title"><div className="inner-photo"><Image src={image} alt={imageAlt} fill priority sizes="100vw" /></div><div className="inner-copy"><p className="eyebrow">{kicker}</p><h1 id="inner-hero-title">{title}</h1><p>{copy}</p></div><div className="vertical-label" aria-hidden="true">YORK · ENGLAND · EST 1929</div></section>;
}
