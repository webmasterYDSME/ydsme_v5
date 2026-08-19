"use client";

import { type ReactNode, useState } from "react";

type EventAudience = "member_only" | "public";

export function EventAudienceFields({
  children,
  initialAudience = "member_only",
  initialPublicTeaserEnabled = false,
}: {
  children: ReactNode;
  initialAudience?: EventAudience;
  initialPublicTeaserEnabled?: boolean;
}) {
  const [audience, setAudience] = useState<EventAudience>(initialAudience);

  return <>
    <label>
      Audience
      <select
        name="event_type"
        value={audience}
        onChange={(event) => setAudience(event.currentTarget.value as EventAudience)}
      >
        <option value="member_only">Members only</option>
        <option value="public">Public</option>
      </select>
    </label>
    {children}
    {audience === "member_only" ? <div className="event-public-teaser wide">
      <label className="check">
        <input type="checkbox" name="public_teaser_enabled" defaultChecked={initialPublicTeaserEnabled}/>
        Promote this members-only event on the public events page
      </label>
      <small>When selected, this members-only event will also appear on the public events page.</small>
    </div> : null}
  </>;
}
