"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
  children: ReactNode;
  pendingLabel?: string;
};

export function PendingSubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  disabled,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      type="submit"
      className={["pending-submit", className].filter(Boolean).join(" ")}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      data-pending={pending ? "true" : undefined}
    >
      {pending ? (
        <span className="pending-submit-status" role="status">
          <span className="button-spinner" aria-hidden="true" />
          {pendingLabel}
        </span>
      ) : children}
    </button>
  );
}
