"use client";

import type { InputHTMLAttributes, KeyboardEvent } from "react";

type SubmitOnEnterPasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function SubmitOnEnterInput({ onKeyDown, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
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

  return <input {...props} type={type} onKeyDown={handleKeyDown} />;
}

export function SubmitOnEnterPassword(props: SubmitOnEnterPasswordProps) {
  return <SubmitOnEnterInput {...props} type="password" />;
}
