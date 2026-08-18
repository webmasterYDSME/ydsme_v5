"use client";

import { useId, useState } from "react";

type BookingMode = "none" | "website";

export function EventBookingFields({
  initialMode = "none",
  initialCapacity = 100,
}: {
  initialMode?: BookingMode;
  initialCapacity?: number;
}) {
  const [mode, setMode] = useState<BookingMode>(initialMode);
  const capacityId = useId();

  return <>
    <label>
      Booking mode
      <select
        name="booking_mode"
        value={mode}
        onChange={(event) => setMode(event.currentTarget.value as BookingMode)}
        aria-controls={capacityId}
        aria-expanded={mode === "website"}
      >
        <option value="none">No booking needed</option>
        <option value="website">Website booking</option>
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
