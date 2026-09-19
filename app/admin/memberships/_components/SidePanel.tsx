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

  // What the officer has typed is kept unless they agree to lose it: closing by Escape, the backdrop or the
  // close button asks first. A panel that shows a finished result marks itself with data-discard-safe.
  const edited = useRef(false);
  const confirmClose = () => {
    const element = dialog.current;
    if (!edited.current || element?.querySelector("[data-discard-safe]")) return true;
    return window.confirm("Close without saving? What you have typed will be lost.");
  };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // A click on the dimmed backdrop lands on the dialog element itself, outside its content.
    // Keyboard users close the panel with Escape or the close button.
    const closeOnBackdrop = (event: MouseEvent) => { if (event.target === element && confirmClose()) element.close(); };
    const markEdited = (event: Event) => { if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea")) edited.current = true; };
    const keepOpenIfEdited = (event: Event) => { if (!confirmClose()) event.preventDefault(); };
    element.addEventListener("click", closeOnBackdrop);
    element.addEventListener("input", markEdited);
    element.addEventListener("change", markEdited);
    element.addEventListener("cancel", keepOpenIfEdited);
    return () => {
      element.removeEventListener("click", closeOnBackdrop);
      element.removeEventListener("input", markEdited);
      element.removeEventListener("change", markEdited);
      element.removeEventListener("cancel", keepOpenIfEdited);
    };
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
        <button type="button" className={styles.panelClose} aria-label="Close panel" onClick={() => { if (confirmClose()) dialog.current?.close(); }}><X aria-hidden="true"/></button>
      </header>
      {children}
    </div>
  </dialog>;
}
