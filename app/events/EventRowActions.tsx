"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function EventRowActions({ name, description, children }: { name: string; description: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();

  return <div className="public-event-row-details">
    <div className="public-event-row-actions">
      <button className="public-event-details-toggle" type="button" aria-expanded={open} aria-controls={descriptionId} onClick={() => setOpen(!open)}>
        {open ? "Hide details" : "View details"}<span className="sr-only"> for {name}</span><ChevronDown size={15} aria-hidden="true"/>
      </button>
    </div>
    <p id={descriptionId} className="event-description public-event-expanded-description" hidden={!open}>{description}</p>
    {children && <div className="public-event-row-actions">{children}</div>}
  </div>;
}
