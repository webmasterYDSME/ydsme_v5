"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import styles from "../memberships.module.css";

/**
 * A side panel whose open state lives in the URL, so it can be linked to, survives a refresh and
 * closes by itself when a form action redirects. It uses a native modal dialog, which keeps focus
 * inside the panel and closes on Escape. Closing navigates to `closeHref`.
 */
export function SidePanel({ closeHref, label, eyebrow, eyebrowClassName = "", title, wide = false, children }: {
  closeHref: string;
  label: string;
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // A click on the dimmed backdrop lands on the dialog element itself, outside its content.
    // Keyboard users close the panel with Escape or the close button.
    const closeOnBackdrop = (event: MouseEvent) => { if (event.target === element) element.close(); };
    element.addEventListener("click", closeOnBackdrop);
    return () => element.removeEventListener("click", closeOnBackdrop);
  }, []);

  return <dialog
    ref={dialog}
    className={`${styles.panel} ${wide ? styles.panelWide : ""}`}
    aria-label={label}
    onClose={() => router.replace(closeHref, { scroll: false })}
  >
    <div className={styles.panelBody}>
      <header className={styles.panelHead}>
        <div>
          {eyebrow ? <span className={`${styles.pill} ${eyebrowClassName}`}>{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        <button type="button" className={styles.panelClose} aria-label="Close panel" onClick={() => dialog.current?.close()}><X aria-hidden="true"/></button>
      </header>
      {children}
    </div>
  </dialog>;
}
