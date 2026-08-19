"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";

const SMALL_SCREEN_QUERY = "(max-width: 640px)";

export function ResponsiveDashboardCard({
  children,
  className = "",
  eyebrow,
  heading,
  headingId,
  id,
}: {
  children: ReactNode;
  className?: string;
  eyebrow: string;
  heading: string;
  headingId: string;
  id?: string;
}) {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(SMALL_SCREEN_QUERY);
    const syncScreenSize = () => {
      setIsSmallScreen(media.matches);
      if (media.matches) setExpanded(false);
    };

    syncScreenSize();
    media.addEventListener("change", syncScreenSize);
    return () => media.removeEventListener("change", syncScreenSize);
  }, []);

  useEffect(() => {
    if (!id) return;

    const revealHashTarget = () => {
      if (window.location.hash === `#${id}`) setExpanded(true);
    };

    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, [id]);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (isSmallScreen) setExpanded(event.currentTarget.open);
  }

  return (
    <details
      id={id}
      className={`portal-card dashboard-collapsible-card ${className}`.trim()}
      aria-labelledby={headingId}
      open={!isSmallScreen || expanded}
      onToggle={handleToggle}
    >
      <summary className="card-heading dashboard-collapsible-heading" onClick={(event) => {
        if (!isSmallScreen) event.preventDefault();
      }}>
        <div><p className="eyebrow dark">{eyebrow}</p><h2 id={headingId}>{heading}</h2></div>
        <ChevronDown aria-hidden="true"/>
      </summary>
      <div className="dashboard-collapsible-body">{children}</div>
    </details>
  );
}
