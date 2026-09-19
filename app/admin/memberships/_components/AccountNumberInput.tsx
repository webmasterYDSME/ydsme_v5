"use client";

import { useState } from "react";
import { formatAccountNumberAsTyped } from "@/lib/membership-admin/bank";

/** The account number field, with its label: digits only, at most eight, whatever is typed or pasted. */
export function AccountNumberInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(formatAccountNumberAsTyped(defaultValue));
  return <label>Account number<input
    name={name}
    value={value}
    onChange={(event) => setValue(formatAccountNumberAsTyped(event.target.value))}
    inputMode="numeric"
    autoComplete="off"
    maxLength={8}
    placeholder="12345678"
    pattern="[0-9]{8}"
    title="Eight digits, for example 12345678"
    required
  /></label>;
}
