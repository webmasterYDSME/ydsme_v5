"use client";

import type { InputHTMLAttributes, KeyboardEvent } from "react";

type SubmitOnEnterPasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function SubmitOnEnterPassword({ onKeyDown, ...props }: SubmitOnEnterPasswordProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.nativeEvent.isComposing
    ) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return <input {...props} type="password" onKeyDown={handleKeyDown} />;
}
