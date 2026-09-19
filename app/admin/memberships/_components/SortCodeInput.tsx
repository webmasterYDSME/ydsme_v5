"use client";

import { useState } from "react";
import { formatSortCodeAsTyped } from "@/lib/membership-admin/bank";

/** The sort code field, with its label: whatever is typed or pasted is laid out as 12-34-56, so it is always saved in one form. */
export function SortCodeInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(formatSortCodeAsTyped(defaultValue));
  return <label>Sort code<input
    name={name}
    value={value}
    onChange={(event) => setValue(formatSortCodeAsTyped(event.target.value))}
    inputMode="numeric"
    autoComplete="off"
    maxLength={8}
    placeholder="12-34-56"
    pattern="[0-9]{2}-[0-9]{2}-[0-9]{2}"
    title="Six digits, for example 12-34-56"
    required
  /></label>;
}
