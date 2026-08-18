"use client";

import { Pause, Play, UsersRound } from "lucide-react";
import { useState } from "react";

export function NewMemberMarquee({ title, message }: { title: string; message: string }) {
  const [paused, setPaused] = useState(false);

  return <section className={paused ? "new-member-marquee is-paused" : "new-member-marquee"} aria-label="New member welcome">
    <p className="sr-only"><strong>{title}.</strong> {message}</p>
    <div className="new-member-marquee-viewport" aria-hidden="true">
      <div className="new-member-marquee-track">
        {[0, 1].map(copy => <span className="new-member-marquee-item" key={copy}><UsersRound/><strong>{title}</strong><span>{message}</span></span>)}
      </div>
    </div>
    <button className="new-member-marquee-toggle" type="button" aria-pressed={paused} aria-label={paused ? "Play new member welcome" : "Pause new member welcome"} onClick={() => setPaused(current => !current)}>
      {paused ? <Play aria-hidden="true"/> : <Pause aria-hidden="true"/>}
    </button>
  </section>;
}
