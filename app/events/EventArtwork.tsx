"use client";

import Image from "next/image";
import { useState } from "react";

const fallback = "/images/events.webp";

export function EventArtwork({ src, name, featured = false }: { src: string; name: string; featured?: boolean }) {
  const [failedSource, setFailedSource] = useState<string>();
  const image = failedSource === src ? fallback : src;
  return <div className="public-event-artwork">
    <Image src={image} alt={image === fallback ? "Visitors enjoying a public open day at York Model Engineers" : `${name} event artwork`}
      fill sizes={featured ? "(max-width: 800px) 100vw, (max-width: 1500px) 55vw, 740px" : "(max-width: 600px) 96px, 150px"}
      loading={featured ? "eager" : "lazy"} fetchPriority={featured ? "high" : "auto"}
      onError={() => { if (image !== fallback) setFailedSource(src); }}/>
  </div>;
}
