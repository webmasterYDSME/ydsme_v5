"use client";

import { useId, useState } from "react";

type BookingMode = "none" | "website";

export function EventBookingFields({
  initialMode = "none",
  initialCapacity = 100,
  onModeChange,
}: {
  initialMode?: BookingMode;
  initialCapacity?: number;
  onModeChange?: (mode: BookingMode) => void;
}) {
  const [mode, setMode] = useState<BookingMode>(initialMode);
  const capacityId = useId();

  return <>
    <label>
      Do visitors need to book?
      <select
        name="booking_mode"
        value={mode}
        onChange={(event) => { const next = event.currentTarget.value as BookingMode; setMode(next); onModeChange?.(next); }}
        aria-controls={capacityId}
        aria-expanded={mode === "website"}
      >
        <option value="none">No</option>
        <option value="website">Yes, through this website</option>
      </select>
      <small>Website booking uses the Society’s own visitor booking system.</small>
    </label>
    {mode === "website" ? <label id={capacityId}>
      Visitor capacity
      <input type="number" name="booking_capacity" min="1" max="10000" defaultValue={initialCapacity} required/>
      <small>The maximum number of visitor places available.</small>
    </label> : null}
  </>;
}
