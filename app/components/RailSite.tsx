"use client";

import {ReactNode, useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Globe2, MapPin, Menu, X } from "lucide-react";
import type { PostalAddress, PublicSiteConfig } from "@/lib/data";

const nav = [["Visitors","/visitors"],["Events","/events"],["Our story","/club-history"],["Committee","/committees"],["Membership","/membership"]];

export function Reveal({children, delay=0}:{children:ReactNode;delay?:number}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    let cancelled=false;
    let tween:{kill:()=>void}|undefined;
    const observer=new IntersectionObserver(([entry])=>{
      if(!entry.isIntersecting)return;
      observer.disconnect();
      void import("gsap").then(({default:gsap})=>{
        if(cancelled)return;
        tween=gsap.fromTo(el,{y:42,opacity:0},{y:0,opacity:1,duration:1,delay,ease:"power3.out"});
      });
    },{rootMargin:"0px 0px -12% 0px"});
    observer.observe(el);
    return()=>{cancelled=true;observer.disconnect();tween?.kill();};
  },[delay]);
  return <div ref={ref} className="reveal">{children}</div>;
}

export function SectionHeading({children}:{children:ReactNode}) { return <h2 className="section-heading">{children}</h2>; }

export function InteractiveSteamTrain({ announcements }: { announcements: Array<{ id: number; title: string; body: string }> }) {
  const [playing, setPlaying] = useState(false);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    if (announcements.length < 2 || rotationPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rotationTimer = window.setInterval(() => setAnnouncementIndex((index) => index + 1), 9000);
    return () => window.clearInterval(rotationTimer);
  }, [announcements.length, rotationPaused]);

  const announcement = announcements.length ? announcements[announcementIndex % announcements.length] : undefined;

  const soundDoubleHorn = async () => {
    if (playing) return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audio = new AudioContextClass();
    await audio.resume();
    const now = audio.currentTime;
    const master = audio.createGain();
    const warmth = audio.createBiquadFilter();
    master.gain.value = 0.9;
    warmth.type = "lowpass";
    warmth.frequency.value = 1900;
    warmth.Q.value = 0.8;
    warmth.connect(master);
    master.connect(audio.destination);

    const scheduleHorn = (start: number, duration: number, level: number) => {
      const hornGain = audio.createGain();
      const stop = start + duration;
      hornGain.gain.setValueAtTime(0.0001, start);
      hornGain.gain.exponentialRampToValueAtTime(level, start + 0.035);
      hornGain.gain.setValueAtTime(level, Math.max(start + 0.04, stop - 0.1));
      hornGain.gain.exponentialRampToValueAtTime(0.0001, stop);
      hornGain.connect(warmth);

      [392, 493.88, 587.33, 783.99].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const voice = audio.createGain();
        oscillator.type = index < 2 ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.linearRampToValueAtTime(frequency * 1.012, Math.min(stop, start + 0.35));
        voice.gain.value = index === 0 ? 0.34 : 0.2;
        oscillator.connect(voice);
        voice.connect(hornGain);
        oscillator.start(start);
        oscillator.stop(stop);
      });

      const noiseLength = Math.ceil(audio.sampleRate * duration);
      const noiseBuffer = audio.createBuffer(1, noiseLength, audio.sampleRate);
      const noise = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noise.length; index += 1) noise[index] = Math.random() * 2 - 1;
      const steam = audio.createBufferSource();
      const steamFilter = audio.createBiquadFilter();
      const steamGain = audio.createGain();
      steam.buffer = noiseBuffer;
      steamFilter.type = "bandpass";
      steamFilter.frequency.value = 1250;
      steamFilter.Q.value = 0.55;
      steamGain.gain.setValueAtTime(0.0001, start);
      steamGain.gain.exponentialRampToValueAtTime(0.035, start + 0.025);
      steamGain.gain.setValueAtTime(0.035, Math.max(start + 0.03, stop - 0.08));
      steamGain.gain.exponentialRampToValueAtTime(0.0001, stop);
      steam.connect(steamFilter);
      steamFilter.connect(steamGain);
      steamGain.connect(warmth);
      steam.start(start);
      steam.stop(stop);
    };

    scheduleHorn(now + 0.03, 0.3, 0.17);
    scheduleHorn(now + 0.52, 1.05, 0.2);

    setPlaying(true);
    resetTimer.current = window.setTimeout(() => {
      setPlaying(false);
      void audio.close();
    }, 1850);
  };

  return <div className={announcement ? "train-consist has-announcement" : "train-consist"} onMouseEnter={()=>setRotationPaused(true)} onMouseLeave={()=>setRotationPaused(false)} onFocus={()=>setRotationPaused(true)} onBlur={()=>setRotationPaused(false)}>
    {announcements.length ? <div className="sr-only" role="region" aria-label="Public announcements">{announcements.map(item=><p key={item.id}><strong>{item.title}.</strong> {item.body}</p>)}</div> : null}
    {announcement ? <Link className="train-banner" href="/news" aria-label="Read all news and announcements"><div className="train-banner-copy" key={announcement.id}><div className="train-banner-heading"><strong>{announcement.title}</strong><span className="train-banner-label">Public announcement</span></div><p>{announcement.body}</p></div><div className="train-banner-wheels" aria-hidden="true"><i/><i/></div></Link> : null}
    {announcement ? <span className="train-coupler" aria-hidden="true"/> : null}
    <button className={playing ? "train-marker is-sounding" : "train-marker"} type="button" onClick={soundDoubleHorn} disabled={playing} aria-label="Sound the steam train double horn"><span className="loco-smoke" aria-hidden="true"><i/><i/><i/></span><span className="mini-loco" aria-hidden="true"><span className="loco-chimney"/><span className="loco-boiler"/><span className="loco-cab"/><b className="loco-wheel wheel-one"/><b className="loco-wheel wheel-two"/><b className="loco-wheel wheel-three"/></span></button>
  </div>;
}

function AddressLines({ address }: { address: PostalAddress }) {
  const locality = [address.city, address.postcode].filter(Boolean).join(" · ");
  return <>{address.address_line_one}<br/>{address.address_line_two ? <>{address.address_line_two}<br/></> : null}{locality}{address.country ? <><br/>{address.country}</> : null}</>;
}

function CompactAddressLines({ address }: { address: PostalAddress }) {
  const street = [address.address_line_one, address.address_line_two].filter(Boolean).join(", ");
  const locality = [address.city, address.postcode].filter(Boolean).join(" · ");
  const place = [locality, address.country].filter(Boolean).join(", ");
  return <>{street}<br/>{place}</>;
}

function SocialIcon({ name }: { name: string }) {
  if (name.toLowerCase().includes("facebook")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 21v-8h2.8l.4-3h-3.2V8.1c0-.9.3-1.6 1.7-1.6H17V3.8c-.8-.1-1.6-.2-2.4-.2-2.5 0-4.1 1.5-4.1 4.2V10H8v3h2.5v8h3.1Z"/></svg>;
  return <Globe2 aria-hidden="true"/>;
}

export function RailSiteFrame({children, siteConfig, headerTheme="overlay"}:{children:ReactNode;siteConfig:PublicSiteConfig;headerTheme?:"overlay"|"light"}) {
  const path=usePathname(); const [open,setOpen]=useState(false);
  useEffect(()=>{
    if (!window.location.hash) window.scrollTo({top:0,left:0,behavior:"auto"});
  },[path]);
  useEffect(()=>{
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    document.documentElement.classList.toggle("nav-open",open);
    window.addEventListener("keydown",closeOnEscape);
    return()=>{document.documentElement.classList.remove("nav-open");window.removeEventListener("keydown",closeOnEscape);};
  },[open]);
  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className={headerTheme === "light" ? "site-header site-header-light" : "site-header"}>
      <Link href="/" className="brand"><span className="brand-logo"><Image src="/ydsme-logo.png" alt={siteConfig.fullName} width={76} height={76} /></span><span>York Model<br/><b>Engineers</b></span></Link>
      <nav id="primary-navigation" aria-label="Primary navigation" className={open?"main-nav open":"main-nav"}><Link className={path==="/"?"home-mobile active":"home-mobile"} href="/" onClick={()=>setOpen(false)}>Home</Link>{nav.map(([label,href])=><Link key={href} className={path===href?"active":""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<Link className="login-mobile" href="/signin" onClick={()=>setOpen(false)}>Member login <ArrowUpRight size={15}/></Link></nav>
      <Link className="member-login" href="/signin">Member login <ArrowUpRight size={15}/></Link>
      <button className="menu-button" type="button" onClick={()=>setOpen(!open)} aria-controls="primary-navigation" aria-expanded={open} aria-label={open?"Close navigation":"Open navigation"}>{open?<X/>:<Menu/>}</button>
    </header>
    <main id="main-content">{children}</main>
    <footer className="site-footer">
      <div className="footer-brand"><span className="brand-logo footer-logo"><Image src="/ydsme-logo.png" alt="" width={92} height={92} quality={55} /></span><div><h2>Made by hand.<br/><em>Moved by steam.</em></h2><p>Miniature railways and model engineering in York since 1929.</p></div></div>
      <section className="footer-visit" aria-labelledby="footer-visit-title"><h3 id="footer-visit-title">Visit</h3><address><a className="footer-address-link" href="https://www.google.com/maps/dir/?api=1&amp;destination=53.94183%2C-1.11166" target="_blank" rel="noreferrer" aria-label="Get directions to the exact club entrance coordinates (opens in a new tab)"><MapPin aria-hidden="true"/><span><AddressLines address={siteConfig.clubAddress}/></span><ArrowUpRight aria-hidden="true"/></a></address><a className="footer-email" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>{siteConfig.telephone ? <a href={`tel:${siteConfig.telephone.replace(/[^+\d]/g, "")}`}>{siteConfig.telephone}</a> : null}</section>
      <nav className="footer-navigation" aria-label="Footer navigation"><h3>Explore</h3><Link href="/news">News</Link>{nav.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}</nav>
      <nav className="footer-navigation" aria-label="Legal navigation"><h3>Legal</h3><a href="/documents/visitor-safety-guide.pdf" target="_blank" rel="noreferrer">Health &amp; safety</a><Link href="/privacy-policy">Privacy</Link><Link href="/cookie-policy">Cookies</Link></nav>
      <section className="footer-social" aria-labelledby="footer-social-title"><h3 id="footer-social-title">Follow</h3><div>{siteConfig.socialLinks.map(link=><a className="footer-social-link" key={`${link.name}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.name} (opens in a new tab)`}><span className="footer-social-icon"><SocialIcon name={link.name}/></span><span>{link.name}</span><ArrowUpRight aria-hidden="true"/></a>)}</div></section>
      <div className="footer-bottom">
        <div className="footer-registration">
          <div className="footer-registration-item"><span>Registered society</span><p>{siteConfig.registeredName}<br/>Company no. {siteConfig.companyNumber}</p></div>
          <div className="footer-registration-item"><span>Registered office</span><address><CompactAddressLines address={siteConfig.registeredAddress}/></address></div>
        </div>
        <div className="footer-meta"><p className="footer-copyright">© {new Date().getFullYear()} {siteConfig.shortName}</p><p className="footer-credit">Website by <a href="https://nomen.hunkymonkey.net" target="_blank" rel="author noreferrer">Nomen Ama</a></p></div>
      </div>
    </footer>
  </>;
}

export function InnerHero({kicker,title,copy,image,imageAlt,imagePosition,imageTone="standard"}:{kicker:string;title:ReactNode;copy:string;image:string;imageAlt:string;imagePosition?:string;imageTone?:"standard"|"bright"}) {
  const photoClassName = imageTone === "bright" ? "inner-photo inner-photo-bright" : "inner-photo";
  return <section className="inner-hero" aria-labelledby="inner-hero-title"><div className={photoClassName}><Image src={image} alt={imageAlt} fill loading="eager" fetchPriority="low" quality={35} sizes="100vw" style={imagePosition ? {objectPosition:imagePosition} : undefined} /></div><div className="inner-copy"><p className="eyebrow">{kicker}</p><h1 id="inner-hero-title">{title}</h1><p>{copy}</p></div><div className="vertical-label" aria-hidden="true">YORK · ENGLAND · EST 1929</div></section>;
}
