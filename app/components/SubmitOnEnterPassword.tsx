"use client";

import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import styles from "./PasswordField.module.css";

type SubmitOnEnterPasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { allowReveal?: boolean };

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

export function SubmitOnEnterPassword({ allowReveal = false, ...props }: SubmitOnEnterPasswordProps) {
  const [visible, setVisible] = useState(false);
  if (!allowReveal) return <SubmitOnEnterInput {...props} type="password" />;
  return <div className={styles.field}>
    <SubmitOnEnterInput {...props} type={visible ? "text" : "password"} />
    <button type="button" className={styles.toggle} aria-label={visible ? "Hide password" : "Show password"} aria-controls={props.id} disabled={props.disabled} onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</button>
  </div>;
}
