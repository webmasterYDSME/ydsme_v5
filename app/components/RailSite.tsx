"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const nav = [["Visitors","/visitors"],["Events","/events"],["Our story","/club-history"],["Committee","/committees"],["Membership","/membership"]];

export function Reveal({children, delay=0}:{children:React.ReactNode;delay?:number}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ gsap.registerPlugin(ScrollTrigger); const el=ref.current; if(!el)return; const tween=gsap.fromTo(el,{y:42,opacity:0},{y:0,opacity:1,duration:1,delay,ease:"power3.out",scrollTrigger:{trigger:el,start:"top 88%",once:true}}); return()=>{tween.kill();};},[delay]);
  return <div ref={ref} className="reveal">{children}</div>;
}

export function SectionHeading({children}:{children:React.ReactNode}) { return <h2 className="section-heading">{children}</h2>; }

export function PageShell({children}:{children:React.ReactNode}) {
  const path=usePathname(); const [open,setOpen]=useState(false);
  return <>
    <header className="site-header">
      <Link href="/" className="brand"><span className="brand-logo"><Image src="/logo-original.png" alt="York City and District Society of Model Engineers" width={64} height={64} priority /></span><span>York Model<br/><b>Engineers</b></span></Link>
      <nav className={open?"main-nav open":"main-nav"}>{nav.map(([label,href])=><Link key={href} className={path===href?"active":""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<a className="login-mobile" href="https://www.yorkmodelengineers.co.uk/signin">Member login <ArrowUpRight size={15}/></a></nav>
      <a className="member-login" href="https://www.yorkmodelengineers.co.uk/signin">Member login <ArrowUpRight size={15}/></a>
      <button className="menu-button" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</button>
    </header>
    <main>{children}</main>
    <footer><div className="footer-brand"><span className="brand-logo footer-logo"><Image src="/logo-original.png" alt="York City and District Society of Model Engineers" width={80} height={80} /></span><h2>Made by hand.<br/><em>Moved by steam.</em></h2></div><div><h3>Visit</h3><p>Dringhouses<br/>York · YO24 2JE</p><a href="mailto:secretary@yorkmodelengineers.co.uk">secretary@yorkmodelengineers.co.uk</a></div><div><h3>Explore</h3>{nav.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}<a href="https://www.facebook.com/YorkModelEngineers">Facebook</a></div><div className="footer-small"><p>York City & District Society<br/>of Model Engineers Limited<br/>Company no. 26478R</p><p>© 2026 YCDSME</p></div></footer>
  </>;
}

export function InnerHero({kicker,title,copy,image}:{kicker:string;title:React.ReactNode;copy:string;image:string}) {
  return <section className="inner-hero"><div className="inner-photo" style={{backgroundImage:`linear-gradient(90deg,rgba(9,18,15,.82),rgba(9,18,15,.1)),url(${image})`}}/><div className="inner-copy"><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{copy}</p></div><div className="vertical-label">YORK · ENGLAND · EST 1929</div></section>;
}
