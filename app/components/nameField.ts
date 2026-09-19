import type { FocusEvent } from "react";
import { capitaliseName } from "@/lib/membership-admin/format";

/**
 * Spread onto a person's name box: `<input name="full_name" {...nameFieldProps}/>`.
 * Phone keyboards start each word with a capital, and when the officer leaves the box each word is
 * capitalised. Letters already typed as capitals are kept.
 */
export const nameFieldProps = {
  autoCapitalize: "words",
  spellCheck: false,
  onBlur(event: FocusEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const tidy = capitaliseName(input.value);
    if (tidy === input.value) return;
    // Set it the way typing does, so both controlled and plain fields pick up the change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, tidy);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  },
} as const;
